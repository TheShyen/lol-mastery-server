require('dotenv').config();
const express = require('express');
const serverless = require('serverless-http')
const axios = require('axios');

const app = express();
const router = express.Router();

const API_KEY = process.env.API_KEY;
function getPUUID(nick) {
  return axios.get(`https://europe.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${nick}?api_key=${API_KEY}`)
    .then(response => response.data.puuid)
    .catch(err => console.error(err))
}
function getAccountInfo(puuid, region) {
  return axios.get(`https://${region}.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${puuid}?api_key=${API_KEY}`)
    .then(response => response.data)
    .catch(err => console.error(err))

}
function getChampionMastery(puuid, region) {
  return axios.get(`https://${region}.api.riotgames.com/lol/champion-mastery/v4/champion-masteries/by-puuid/${puuid}/top?api_key=${API_KEY}`)
    .then(response => response.data)

    .catch(err => console.error(err))
}

function getGameModesStats(id, region) {
  return axios.get(`https://${region}.api.riotgames.com/lol/league/v4/entries/by-summoner/${id}?api_key=${API_KEY}`)
    .then(response => response.data)
    .catch(err => console.error(err))

}

function getMatchList(puuid) {
  return axios.get(`https://europe.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?start=0&count=10&api_key=${API_KEY}`)
    .then(response => response.data)
    .catch(err => console.error(err))
}
function getMatch(id) {
  return axios.get(`https://europe.api.riotgames.com/lol/match/v5/matches/${id}?api_key=${API_KEY}`)
    .then(response => response.data)
    .catch(err => console.error(err))
}
function getMatchTimeline(id) {
  return axios.get(`https://europe.api.riotgames.com/lol/match/v5/matches/${id}/timeline?api_key=${API_KEY}`)
    .then(response => response.data)
    .catch(err => console.error(err))
}
async function createMatchListWithFullInfo(PUUID) {
  const matchList = await getMatchList(PUUID);
  const matchInfoPromises = matchList.map(id => getMatch(id));
  return Promise.all(matchInfoPromises);
}
function createPlayerGameStats(matchList, puuid) {
  return matchList.map((item) => {
    const playerIndex = item.metadata.participants.indexOf(puuid)
    const playerInfo = {...item.info.participants[playerIndex]};
    playerInfo.matchID = item.metadata.matchId;
    return playerInfo;
  })
}

function getGoldDifference(frames) {
  return frames.map(frame => calculateGoldDifference(frame.participantFrames))
}

function calculateGoldDifference(participantFrames) {
  let sumFirstFive = 0;
  let sumLastFive = 0;

  for (let i = 1; i < 6; i++) {
    sumFirstFive += participantFrames[i].totalGold;
    sumLastFive += participantFrames[i + 5].totalGold;
  }

  return sumFirstFive - sumLastFive;
}

router.get('/:region/summoner/:userId', async (req, res) => {
  try {
    const nick = req.params.userId.split("+").join('/');
    const region = req.params.region
    const PUUID = await getPUUID(nick);
    const accountInfo = await getAccountInfo(PUUID, region);
    const [championMastery, gameModesStats, matchList] = await Promise.all([
      getChampionMastery(PUUID, region),
      getGameModesStats(accountInfo.id, region),
      createMatchListWithFullInfo(PUUID)
    ]);

    const playerPerformances = createPlayerGameStats(matchList, PUUID);

    return res.json({
      accountInfo,
      championMastery,
      gameModesStats,
      matchList,
      playerPerformances
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
})
router.get('/:region/match/:id', async (req, res) => {
  try {
    const matchId = req.params.id
    const region = req.params.region
    const [matchInfo, matchTimeline] = await Promise.all( [getMatch(matchId), getMatchTimeline(matchId)])
    const playerStatsPromises = matchInfo.info.participants.map(async playerStat => {
      const accountInfo = await getAccountInfo(playerStat.puuid, region)
      playerStat.rank = await getGameModesStats(accountInfo.id, region)
      return playerStat
    })
    matchInfo.info.participants = await Promise.all(playerStatsPromises)
    const goldDifference = getGoldDifference(matchTimeline.info.frames)
    return res.json({
      matchInfo,
      matchTimeline,
      goldDifference
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
})
router.get('/demo', (req, res) => {
  res.json([
    {
      id: '001',
      name: 'Smith',
      email: 'smith@gmail.com',
    },
    {
      id: '002',
      name: 'Sam',
      email: 'sam@gmail.com',
    },
    {
      id: '003',
      name: 'lily',
      email: 'lily@gmail.com',
    },
  ]);
});
app.use('/.netlify/functions/api', router);
module.exports.handler = serverless(app);