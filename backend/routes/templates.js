const express = require('express');
const router = express.Router();

// Ollama API endpoint (default local installation)
const OLLAMA_API_URL = process.env.OLLAMA_API_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'phi4-mini'; // memory-efficient model, more or less)

// Game template prompts
const TEMPLATE_PROMPTS = {
  hangman: `Generate a JSON object for drawing ONLY a hangman gallows structure on an HTML canvas (1920x1080px).
The JSON should contain an array of drawing commands with this structure:
{
  "template": "hangman",
  "canvasWidth": 1920,
  "canvasHeight": 1080,
  "elements": [
    {
      "type": "line",
      "x1": number,
      "y1": number,
      "x2": number,
      "y2": number,
      "color": "string",
      "width": number
    }
  ]
}

Draw ONLY a classic gallows structure (NO stick figure, NO body parts):
1. Base platform (horizontal line at y=900, about 400px wide, centered around x=900)
2. Vertical support pole (from y=900 up to y=250, at x=800, width: 15)
3. Diagonal support brace (from x=850,y=900 to x=800,y=780, width: 10)
4. Top horizontal beam (from x=800,y=250 to x=1050,y=250, width: 15)
5. Small vertical support from beam (from x=850,y=250 to x=850,y=320, width: 10)
6. Rope hanging from beam end (from x=1050,y=250 to x=1050,y=350, width: 6)

Use brown wood color "#654321" for the gallows structure.
Use golden color "#B8860B" for the rope.
DO NOT include any stick figure, head, body, arms, or legs - those are drawn later during gameplay!

Respond ONLY with valid JSON, no explanations.`,

};

// Call Ollama API
async function generateWithOllama(prompt, model = OLLAMA_MODEL) {
  try {
    // Added 30 second timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    const response = await fetch(`${OLLAMA_API_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model,
        prompt: prompt,
        stream: false,
        options: {
          temperature: 0.3, // low temperature for consistent structured output
          top_p: 0.9,
        },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.response;
  } catch (error) {
    if (error.name === 'AbortError') {
      console.error('Ollama request timed out after 30 seconds');
      throw new Error('AI generation timed out - model may need to be pulled first (ollama pull phi4-mini)');
    }
    console.error('Ollama API call failed:', error);
    throw error;
  }
}

// Parse JSON from AI response (handles markdown code blocks)
function extractJSON(text) {
  // Remove markdown code blocks if present
  text = text.replace(/```json\s*/g, '').replace(/```\s*/g, '');

  // Find JSON object
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('No JSON found in response');
  }

  return JSON.parse(jsonMatch[0]);
}

// Fallback templates (if Ollama fails) - SCALED FOR 1920x1080 CANVAS
const FALLBACK_TEMPLATES = {
  hangman: {
    template: 'hangman',
    canvasWidth: 1920,
    canvasHeight: 1080,
    elements: [
      // ONLY Gallows structure - stick figure drawn progressively on wrong guesses
      // Base platform (wide horizontal)
      { type: 'line', x1: 700, y1: 900, x2: 1100, y2: 900, color: '#654321', width: 15 },
      // Vertical support pole
      { type: 'line', x1: 800, y1: 900, x2: 800, y2: 250, color: '#654321', width: 15 },
      // Diagonal support brace
      { type: 'line', x1: 850, y1: 900, x2: 800, y2: 780, color: '#654321', width: 10 },
      // Top horizontal beam
      { type: 'line', x1: 800, y1: 250, x2: 1050, y2: 250, color: '#654321', width: 15 },
      // Small vertical support from beam
      { type: 'line', x1: 850, y1: 250, x2: 850, y2: 320, color: '#654321', width: 10 },
      // Rope
      { type: 'line', x1: 1050, y1: 250, x2: 1050, y2: 350, color: '#B8860B', width: 6 },
    ],
  },

};

// GET /templates/list - List available templates
router.get('/list', async (req, res) => {
  try {
    res.json({
      templates: ['hangman'],
      model: OLLAMA_MODEL,
      ollamaAvailable: await checkOllamaHealth(),
    });
  } catch (error) {
    res.json({
      templates: ['hangman'],
      model: OLLAMA_MODEL,
      ollamaAvailable: false,
      error: error.message,
    });
  }
});

// POST /templates/generate - Generate template with AI
router.post('/generate', async (req, res) => {
  try {
    const { template, useAI = true, word } = req.body;

    if (!template || !TEMPLATE_PROMPTS[template]) {
      return res.status(400).json({ error: 'Invalid template name' });
    }

    // For hangman, validate word parameter
    if (template === 'hangman' && word) {
      if (typeof word !== 'string' || word.length < 3 || word.length > 12) {
        return res.status(400).json({ error: 'Word must be 3-12 characters' });
      }
      if (!/^[A-Z]+$/.test(word)) {
        return res.status(400).json({ error: 'Word must contain only letters' });
      }
    }

    // Try Ollama AI generation first
    if (useAI) {
      try {
        console.log(`Generating ${template} template with Ollama (${OLLAMA_MODEL})...`);
        const aiResponse = await generateWithOllama(TEMPLATE_PROMPTS[template]);
        const templateData = extractJSON(aiResponse);

        console.log(`AI generated ${template} template successfully`);
        return res.json({
          success: true,
          source: 'ai',
          model: OLLAMA_MODEL,
          ...templateData,
        });
      } catch (aiError) {
        console.warn('Ollama generation failed, using fallback:', aiError.message);
        // Fall through to fallback
      }
    }

    // Use fallback template
    console.log(`Using fallback template for ${template}`, word ? `with word: ${word}` : '');

    let templateData = { ...FALLBACK_TEMPLATES[template] };

    // For hangman with word, just store it (no boxes on canvas)
    if (template === 'hangman' && word) {
      templateData.word = word; // Store word in template for game logic
    }

    res.json({
      success: true,
      source: 'fallback',
      ...templateData,
    });

  } catch (error) {
    console.error('Template generation error:', error);
    res.status(500).json({ error: 'Failed to generate template', details: error.message });
  }
});

// Health check for Ollama
async function checkOllamaHealth() {
  try {
    const response = await fetch(`${OLLAMA_API_URL}/api/tags`, {
      method: 'GET',
      signal: AbortSignal.timeout(2000), // 2 second timeout
    });
    return response.ok;
  } catch {
    return false;
  }
}

// POST /templates/game-prompt - Generate quirky game prompts with AI
router.post('/game-prompt', async (req, res) => {
  try {
    const { game, event, context } = req.body;

    if (!game || !event) {
      return res.status(400).json({ error: 'Missing game or event parameter' });
    }

    // Fallback prompts (if AI unavailable)
    // Personalized prompt system: different messages for self vs others (found during troubleshooting with ChatGPT)
    const fallbackPrompts = {
      hangman: {
        start: "The gallows await... can you save them?",
        hit: "A letter appears from the shadows!",
        miss: "Wrong! Another piece is drawn...",
        hit_self: "YES! You found a letter! Keep going!",
        miss_self: "Oops! That's not it. Better luck next time, word detective!",
        hit_other: `${context?.guesser || 'Someone'} found a letter! The plot thickens...`,
        miss_other: `${context?.guesser || 'Someone'} guessed wrong. Another step toward the gallows...`,
        win: "Victory! You've saved them from the gallows!",
        lose: "Game Over. The word has claimed another soul.",
      },
    };


    // AI prompts
    const aiPrompts = {
      hangman: {
        start: "Generate a short (10-15 words), dark humor message about starting a hangman game. Use gallows/execution theme but keep it lighthearted and fun.",
        hit: "Generate a short (10-15 words), encouraging message for guessing a correct letter in hangman. Make it dramatic but positive.",
        miss: "Generate a short (10-15 words), ominous message for a wrong letter guess in hangman. Reference the gallows or fate, but keep it playful.",
        hit_self: "Generate a short (10-15 words), excited and encouraging message for when YOU guess a correct letter in hangman. Make it personal and celebratory!",
        miss_self: "Generate a short (10-15 words), silly joke or sympathetic message for when YOU guess wrong in hangman. Keep it lighthearted and funny!",
        hit_other: `Generate a short (10-15 words), quirky observation about ${context?.guesser || 'someone'} guessing a correct letter in hangman. Make it witty and fun!`,
        miss_other: `Generate a short (10-15 words), darkly humorous message about ${context?.guesser || 'someone'} guessing wrong in hangman. Gallows theme but playful!`,
        win: "Generate a short (10-15 words), celebratory message for winning hangman. The player saved someone from hanging!",
        lose: "Generate a short (10-15 words), dramatic game over message for hangman. The word has been lost.",
      },
    };

    const aiPrompt = aiPrompts[game]?.[event];

    if (aiPrompt) {
      try {
        console.log(`Generating ${game} ${event} prompt with AI...`);
        const aiResponse = await generateWithOllama(
          aiPrompt + " Respond with ONLY the message, no quotes or explanations. DO NOT use emojis - use plain text only."
        );

        const prompt = aiResponse.trim().replace(/^["']|["']$/g, ''); // Remove quotes

        return res.json({
          success: true,
          source: 'ai',
          prompt,
          game,
          event,
        });
      } catch (aiError) {
        console.warn('AI prompt generation failed, using fallback:', aiError.message);
      }
    }

    // Use fallback
    const fallbackPrompt = fallbackPrompts[game]?.[event] || "Let the game begin!";

    res.json({
      success: true,
      source: 'fallback',
      prompt: fallbackPrompt,
      game,
      event,
    });

  } catch (error) {
    console.error('Game prompt generation error:', error);
    res.status(500).json({
      error: 'Failed to generate prompt',
      details: error.message
    });
  }
});

// POST /templates/hangman-hint - Generate witty hint for hangman word
router.post('/hangman-hint', async (req, res) => {
  try {
    const { word } = req.body;

    if (!word || typeof word !== 'string' || word.length < 3) {
      return res.status(400).json({ error: 'Valid word required (minimum 3 characters)' });
    }

    const cleanWord = word.toUpperCase().trim();

    // AI prompt for generating witty hint
    const aiPrompt = `Generate a witty, clever hint for the word "${cleanWord}" in a hangman game.
The hint should:
- Be clever and fun, maybe use wordplay or puns
- Give a subtle clue without being too obvious
- Be 10-20 words maximum
- NOT contain the word itself or any part of it
- Be entertaining and engaging

Respond with ONLY the hint, no quotes or explanations. DO NOT use emojis - use plain text only.`;

    try {
      console.log(`Generating witty hint for word: ${cleanWord}`);
      const aiResponse = await generateWithOllama(aiPrompt);
      const hint = aiResponse.trim().replace(/^["']|["']$/g, '');

      return res.json({
        success: true,
        source: 'ai',
        hint,
        word: cleanWord,
      });
    } catch (aiError) {
      console.warn('AI hint generation failed, using fallback:', aiError.message);

      // Fallback: simple generic hints
      const fallbackHints = [
        `A ${cleanWord.length}-letter mystery awaits... Can you decode it?`,
        `Think carefully! This word has ${cleanWord.length} letters.`,
        `${cleanWord.length} letters stand between you and victory!`,
        `Hint: It's spelled with ${cleanWord.length} letters. Good luck!`,
      ];

      const randomHint = fallbackHints[Math.floor(Math.random() * fallbackHints.length)];

      return res.json({
        success: true,
        source: 'fallback',
        hint: randomHint,
        word: cleanWord,
      });
    }

  } catch (error) {
    console.error('Hangman hint generation error:', error);
    res.status(500).json({
      error: 'Failed to generate hint',
      details: error.message
    });
  }
});

// POST /templates/wrong-guess-hint - Generate pun/riddle for wrong guess
router.post('/wrong-guess-hint', async (req, res) => {
  try {
    const { word, wrongGuesses } = req.body;

    if (!word || typeof word !== 'string' || word.length < 3) {
      return res.status(400).json({ error: 'Valid word required (minimum 3 characters)' });
    }

    const cleanWord = word.toUpperCase().trim();

    // AI prompt for generating pun or riddle
    const aiPrompt = `Generate a clever pun, riddle, or wordplay hint for the word "${cleanWord}" in a hangman game.
The player just made a wrong guess (${wrongGuesses} wrong guesses so far).

The hint should:
- Be a clever pun, riddle, or wordplay related to the word
- Be entertaining and make the player smile despite the wrong guess
- Give a subtle clue without being too obvious
- Be 15-25 words maximum
- NOT contain the word itself or any direct part of it
- Be encouraging but playful
- Use humor, puns, or riddles to hint at the meaning or category of the word

Examples of good hints:
- For "PIZZA": "When you're feeling cheesy and circular, this Italian delight might just be the slice of life you need!"
- For "OCEAN": "It's salty, it waves hello, and covers most of the planet. No, it's not your ex!"
- For "GUITAR": "Six strings walk into a bar... and make beautiful music together. Rock on!"

Respond with ONLY the hint, no quotes or explanations. DO NOT use emojis - use plain text only.`;

    try {
      console.log(`Generating wrong guess hint for word: ${cleanWord} (${wrongGuesses} wrong)`);
      const aiResponse = await generateWithOllama(aiPrompt);
      const hint = aiResponse.trim().replace(/^["']|["']$/g, ''); // Remove quotes

      return res.json({
        success: true,
        source: 'ai',
        hint,
        word: cleanWord,
      });
    } catch (aiError) {
      console.warn('AI wrong guess hint generation failed, using fallback:', aiError.message);

      // Fallback: generic hints with puns
      const fallbackHints = [
        `Oops! That letter's not here. But here's a hint: this ${cleanWord.length}-letter word is quite puzzling!`,
        `Wrong guess, but don't worry! Think of something with ${cleanWord.length} letters that might surprise you!`,
        `Bzzt! Try again! This word has ${cleanWord.length} letters and it's playing hide and seek.`,
        `Not quite! Here's a clue: count to ${cleanWord.length} and think mysterious thoughts!`,
        `That letter took a wrong turn! Hint: ${cleanWord.length} spaces are waiting to be filled with destiny.`,
      ];

      const randomHint = fallbackHints[Math.floor(Math.random() * fallbackHints.length)];

      return res.json({
        success: true,
        source: 'fallback',
        hint: randomHint,
        word: cleanWord,
      });
    }

  } catch (error) {
    console.error('Wrong guess hint generation error:', error);
    res.status(500).json({
      error: 'Failed to generate wrong guess hint',
      details: error.message
    });
  }
});

module.exports = router;
