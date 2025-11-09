// exports api routes
// note: only the user who created an export can view/download it.
// if later we want teammates to see each other's exports, we can relax filters.

const express = require('express');
const { authenticate, checkWhiteboardAccess } = require('../middleware/auth');
const { Export, Activity } = require('../models');

const router = express.Router();

// constants
const ALLOWED_FORMATS = ['png', 'pdf', 'svg', 'json'];
const QUOTA_LIMIT = 10; // per 24h window

// helpers
function parseLimit(raw, fallback = 50, max = 100) {
  // parse "limit" safely and clamp to sane bounds (optimized using ChatGPT)
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(n, max);
}

function validateExportOptions(format, options = {}) {
  // normalize per-format options; keep defaults simple (optimized using ChatGPT)
  const out = {};

  if (format === 'png') {
    const res = options.resolution;
    out.resolution = ['1x', '2x', '4x'].includes(res) ? res : '2x';
  }

  if (format === 'pdf') {
    const size = options.pageSize;
    const orient = options.orientation;
    out.pageSize = ['A4', 'Letter', 'Custom'].includes(size) ? size : 'A4';
    out.orientation = ['portrait', 'landscape'].includes(orient) ? orient : 'landscape';
  }

  if (format === 'svg') {
    out.compressed = Boolean(options.compressed);
  }

  if (format === 'json') {
    out.includeMetadata = Boolean(options.includeMetadata);
  }

  return out;
}

// get all exports for current user
router.get('/', authenticate, async (req, res) => {
  try {
    const { status, format, limit } = req.query;

    const query = { userId: req.userId };
    if (status) query.status = status;
    if (format) query.format = format;

    const exports = await Export.find(query)
      .sort({ createdAt: -1 })
      .limit(parseLimit(limit))
      .select('-error') // don't leak internal error details
      .lean();

    res.json({ exports });
  } catch (err) {
    console.error('get exports error:', err);
    res.status(500).json({ error: 'Failed to fetch exports' });
  }
});

// get exports for a specific whiteboard (only the current user’s)
router.get('/whiteboard/:whiteboardId', authenticate, async (req, res) => {
  try {
    const exports = await Export.find({
      whiteboardId: req.params.whiteboardId,
      userId: req.userId,
    })
      .sort({ createdAt: -1 })
      .lean();

    res.json({ exports });
  } catch (err) {
    console.error('get whiteboard exports error:', err);
    res.status(500).json({ error: 'Failed to fetch exports' });
  }
});

/**
 * NOTE: keep this route BEFORE "/:id"
 * otherwise "/:id" will capture the "quota" segment.
 * (fixed using ChatGPT)
 */
// get user’s export quota usage
router.get('/quota/usage', authenticate, async (req, res) => {
  try {
    const quotaUsage = await Export.getQuotaUsage(req.userId, 24 * 60 * 60 * 1000);

    res.json({
      quotaUsage,
      quotaLimit: QUOTA_LIMIT,
      quotaRemaining: Math.max(0, QUOTA_LIMIT - quotaUsage),
      // simple estimate for reset; real rolling window would need
      // the timestamp of the oldest counted export
      resetsAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });
  } catch (err) {
    console.error('get quota error:', err);
    res.status(500).json({ error: 'Failed to fetch quota usage' });
  }
});

// get single export by id
router.get('/:id', authenticate, async (req, res) => {
  try {
    const exportDoc = await Export.findById(req.params.id);
    if (!exportDoc) return res.status(404).json({ error: 'Export not found' });

    // ownership check
    if (exportDoc.userId !== req.userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // availability check
    if (!exportDoc.isAvailable) {
      return res
        .status(410)
        .json({ error: 'Export has expired or is no longer available' });
    }

    res.json({ export: exportDoc });
  } catch (err) {
    console.error('get export error:', err);
    res.status(500).json({ error: 'Failed to fetch export' });
  }
});

// create new export request
router.post('/', authenticate, checkWhiteboardAccess, async (req, res) => {
  try {
    const { whiteboardId, format, options } = req.body;

    // format check
    if (!ALLOWED_FORMATS.includes(format)) {
      return res
        .status(400)
        .json({ error: 'Invalid format. Use: png, pdf, svg, or json' });
    }

    // quota check (24 hours)
    const quotaUsage = await Export.getQuotaUsage(req.userId, 24 * 60 * 60 * 1000);
    if (quotaUsage >= QUOTA_LIMIT) {
      return res.status(429).json({
        error: `Export quota exceeded. Limit: ${QUOTA_LIMIT} per 24 hours`,
        quotaUsage,
        quotaLimit: QUOTA_LIMIT,
      });
    }

    // normalize per-format options
    const validatedOptions = validateExportOptions(format, options);

    // create export
    const exportDoc = await Export.create({
      whiteboardId,
      userId: req.userId,
      format,
      options: validatedOptions,
      fileUrl: '',
      fileSize: 0,
      status: 'processing',
    });

    // activity log
    await Activity.create({
      whiteboardId,
      userId: req.userId,
      action: 'exported',
      details: { format, exportId: exportDoc._id },
    });

    res.status(202).json({
      message: 'Export queued for processing',
      export: {
        id: exportDoc._id,
        format: exportDoc.format,
        status: exportDoc.status,
        createdAt: exportDoc.createdAt,
      },
    });
  } catch (err) {
    console.error('create export error:', err);
    res.status(500).json({ error: 'Failed to create export' });
  }
});

// download export (returns signed url + metadata)
router.get('/:id/download', authenticate, async (req, res) => {
  try {
    const exportDoc = await Export.findById(req.params.id);
    if (!exportDoc) return res.status(404).json({ error: 'Export not found' });

    if (exportDoc.userId !== req.userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (!exportDoc.isAvailable) {
      return res
        .status(410)
        .json({ error: 'Export has expired or is no longer available' });
    }

    // track downloads for stats/rate limits later
    await exportDoc.trackDownload();

    res.json({
      message: 'Download ready',
      fileUrl: exportDoc.fileUrl,
      fileName: `whiteboard-${exportDoc.whiteboardId}-${exportDoc.format}-${exportDoc._id}.${exportDoc.format}`,
      fileSize: exportDoc.fileSize,
      expiresAt: exportDoc.expiresAt,
    });
  } catch (err) {
    console.error('download export error:', err);
    res.status(500).json({ error: 'Failed to download export' });
  }
});

// delete export
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const exportDoc = await Export.findById(req.params.id);
    if (!exportDoc) return res.status(404).json({ error: 'Export not found' });

    if (exportDoc.userId !== req.userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // todo: delete the file from storage provider (s3/gcs/etc.)
    await Export.deleteOne({ _id: exportDoc._id });

    res.json({ message: 'Export deleted successfully' });
  } catch (err) {
    console.error('delete export error:', err);
    res.status(500).json({ error: 'Failed to delete export' });
  }
});

module.exports = router;
