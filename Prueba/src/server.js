// server.js
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const morgan = require('morgan');
const mongoose = require('mongoose');
const axios = require('axios');

const app = express();
const port = process.env.PORT || 5000;

app.use(morgan('combined'));
app.use(bodyParser.json());
app.use(cors());
app.use(express.json());

// Conexión a la base de datos MongoDB
const uri = "mongodb+srv://pablo:pablo@cluster0.piucs2w.mongodb.net/Juego?retryWrites=true&w=majority";
mongoose.connect(uri, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('Conectado a MongoDB Atlas'))
  .catch(e => console.log(e));

// Modelo de datos para las estadísticas del juego
const gameStatsSchema = new mongoose.Schema({
  playerCards: [Object],
  dealerCards: [Object],
  playerPoints: Number,
  dealerPoints: Number,
  winner: String,
  createdAt: Date,
});

const GameStats = mongoose.model('GameStats', gameStatsSchema);

// Función para calcular la suma de puntos de una mano de cartas
function calculatePoints(cards) {
  let points = 0;
  let numAces = 0;

  cards.forEach(card => {
    if (card.value === "ACE") {
      numAces++;
    } else if (["KING", "QUEEN", "JACK"].includes(card.value)) {
      points += 10;
    } else {
      points += parseInt(card.value);
    }
  });

  // Handling Aces as 11 or 1 based on total points
  for (let i = 0; i < numAces; i++) {
    if (points + 11 <= 21) {
      points += 11;
    } else {
      points += 1;
    }
  }

  return points;
}

// Ruta para empezar el juego
app.post('/api/start', async (req, res) => {
  try {
    const response = await axios.get('https://deckofcardsapi.com/api/deck/new/shuffle/?deck_count=1');
    const deckId = response.data.deck_id;

    const playerResponse = await axios.get(`https://deckofcardsapi.com/api/deck/${deckId}/draw/?count=2`);
    const dealerResponse = await axios.get(`https://deckofcardsapi.com/api/deck/${deckId}/draw/?count=2`);

    const playerCards = playerResponse.data.cards;
    const dealerCards = dealerResponse.data.cards;

    const playerPoints = calculatePoints(playerCards);
    const dealerPoints = calculatePoints(dealerCards);

    if (playerPoints === 21 || dealerPoints === 21) {
      const winner = playerPoints === 21 ? 'player' : 'dealer';
      const gameStats = new GameStats({
        playerCards,
        dealerCards,
        playerPoints,
        dealerPoints,
        winner,
        createdAt: new Date(),
      });

      const savedGameStats = await gameStats.save();

      return res.json({ message: 'Juego iniciado', gameStats: savedGameStats });
    }

    const gameStats = new GameStats({
      playerCards,
      dealerCards,
      playerPoints,
      dealerPoints,
      winner: '', // Aún no hay un ganador definido
      createdAt: new Date(),
    });

    const savedGameStats = await gameStats.save();

    res.json({ message: 'Juego iniciado', gameStats: savedGameStats });
  } catch (error) {
    console.error('Error al empezar el juego:', error.message);
    res.status(500).json({ error: 'Error al empezar el juego' });
  }
});

// Ruta para obtener una nueva carta
app.post('/api/getCard', async (req, res) => {
  try {
    const { gameId, player } = req.body;

    const gameStats = await GameStats.findById(gameId);

    if (!gameStats) {
      return res.status(404).json({ error: 'Juego no encontrado' });
    }

    const deckId = gameStats.playerCards.length > 0 ? gameStats.playerCards[0].deck_id : gameStats.dealerCards[0].deck_id;
    const response = await axios.get(`https://deckofcardsapi.com/api/deck/${deckId}/draw/?count=1`);
    const newCard = response.data.cards[0];

    if (player === 'player') {
      gameStats.playerCards.push(newCard);
      gameStats.playerPoints = calculatePoints(gameStats.playerCards);
    } else if (player === 'dealer') {
      gameStats.dealerCards.push(newCard);
      gameStats.dealerPoints = calculatePoints(gameStats.dealerCards);
    }

    if (gameStats.playerPoints > 21 || gameStats.dealerPoints > 21) {
      gameStats.winner = gameStats.playerPoints > 21 ? 'dealer' : 'player';
    }

    const updatedGameStats = await gameStats.save();

    res.json({ message: 'Nueva carta obtenida', card: newCard, gameStats: updatedGameStats });
  } catch (error) {
    console.error('Error al obtener una nueva carta:', error.message);
    res.status(500).json({ error: 'Error al obtener una nueva carta' });
  }
});

// Ruta para obtener las estadísticas del juego
app.get('/api/gameStats/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const gameStats = await GameStats.findById(id);
    res.json(gameStats);
  } catch (error) {
    console.error('Error al obtener las estadísticas del juego:', error.message);
    res.status(500).json({ error: 'Error al obtener las estadísticas del juego' });
  }
});

// Ruta para actualizar las estadísticas del juego
app.put('/api/gameStats/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { playerCards, dealerCards, playerPoints, dealerPoints, winner } = req.body;
    const gameStats = await GameStats.findByIdAndUpdate(id, {
      playerCards,
      dealerCards,
      playerPoints,
      dealerPoints,
      winner,
    }, { new: true });
    res.json(gameStats);
  } catch (error) {
    console.error('Error al actualizar las estadísticas del juego:', error.message);
    res.status(500).json({ error: 'Error al actualizar las estadísticas del juego' });
  }
});

app.listen(port, () => {
  console.log(`Escuchando en el puerto ${port}`);
});
