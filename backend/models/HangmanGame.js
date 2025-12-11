const mongoose = require('mongoose');

const hangmanGameSchema = new mongoose.Schema({
  whiteboardId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Whiteboard',
    required: true,
  },
  creatorId: {
    type: String,
    required: true,
  },
  word: {
    type: String,
    required: true,
    uppercase: true,
  },
  hint: {
    type: String,
    default: '',
  },
  guessedLetters: {
    type: [String],
    default: [],
  },
  wrongGuesses: {
    type: Number,
    default: 0,
  },
  maxWrongGuesses: {
    type: Number,
    default: 6,
  },
  players: [{
    userId: String,
    userName: String,
    joinedAt: Date,
  }],
  status: {
    type: String,
    enum: ['active', 'won', 'lost'],
    default: 'active',
  },
  winner: {
    userId: String,
    userName: String,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  completedAt: Date,
});

// Get revealed word (e.g., "H_LL_" for "HELLO" with guessed letters H, L)
hangmanGameSchema.methods.getRevealedWord = function() {
  return this.word
    .split('')
    .map(letter => this.guessedLetters.includes(letter) ? letter : '_')
    .join(' ');
};

// Check if word is fully revealed
hangmanGameSchema.methods.isWordRevealed = function() {
  return this.word.split('').every(letter => this.guessedLetters.includes(letter));
};

// Get available letters (A-Z minus guessed)
hangmanGameSchema.methods.getAvailableLetters = function() {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  return alphabet.filter(letter => !this.guessedLetters.includes(letter));
};

// Process a guess
hangmanGameSchema.methods.guessLetter = function(letter) {
  letter = letter.toUpperCase();

  if (this.guessedLetters.includes(letter)) {
    return { success: false, message: 'Letter already guessed', alreadyGuessed: true };
  }

  if (!/^[A-Z]$/.test(letter)) {
    return { success: false, message: 'Invalid letter' };
  }

  this.guessedLetters.push(letter);

  const correct = this.word.includes(letter);

  if (!correct) {
    this.wrongGuesses++;
    if (this.wrongGuesses >= this.maxWrongGuesses) {
      this.status = 'lost';
      this.completedAt = new Date();
    }
  } else if (this.isWordRevealed()) {
    this.status = 'won';
    this.completedAt = new Date();
  }

  return {
    success: true,
    correct,
    wrongGuesses: this.wrongGuesses,
    maxWrongGuesses: this.maxWrongGuesses,
    revealedWord: this.getRevealedWord(),
    status: this.status,
    gameOver: this.status !== 'active',
  };
};

module.exports = mongoose.model('HangmanGame', hangmanGameSchema);

// Used ChatGTP to help with this model (troubleshooting)
