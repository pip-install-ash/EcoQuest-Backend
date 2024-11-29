const express = require('express');
const admin = require('firebase-admin');
const checkAuth = require('../../middleware/authentication');

const router = express.Router();

// Create a new league
router.post('/create', checkAuth, async (req, res) => {
  const { leagueName, userIds } = req.body;
  try {
    const leagueRef = await admin.firestore().collection('leagues').add({
      leagueName,
      userIds,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    res.status(201).json({ id: leagueRef.id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get league details and total points by user ID
router.get('/user/:userId', checkAuth, async (req, res) => {
  const { userId } = req.params;
  try {
    const leaguesSnapshot = await admin
      .firestore()
      .collection('leagues')
      .where('userIds', 'array-contains', userId)
      .get();

    if (leaguesSnapshot.empty) {
      return res.status(404).json({ error: 'No leagues found for this user' });
    }

    const leagues = [];
    for (const leagueDoc of leaguesSnapshot.docs) {
      const leagueData = leagueDoc.data();
      const pointsSnapshot = await admin
        .firestore()
        .collection('leagues')
        .doc(leagueDoc.id)
        .collection('points')
        .get();

      const totalPoints = pointsSnapshot.docs.reduce(
        (sum, doc) => sum + (doc.data().points || 0),
        0
      );
      leagues.push({ id: leagueDoc.id, ...leagueData, totalPoints });
    }

    res.status(200).json(leagues);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
// Get league details
router.get('/:leagueId', checkAuth, async (req, res) => {
  const { leagueId } = req.params;
  try {
    const leagueDoc = await admin
      .firestore()
      .collection('leagues')
      .doc(leagueId)
      .get();
    if (!leagueDoc.exists) {
      return res.status(404).json({ error: 'League not found' });
    }
    res.status(200).json(leagueDoc.data());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update league
router.put('/:leagueId', checkAuth, async (req, res) => {
  const { leagueId } = req.params;
  const { leagueName, userIds } = req.body;
  try {
    await admin.firestore().collection('leagues').doc(leagueId).update({
      leagueName,
      userIds,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    res.status(200).json({ message: 'League updated successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete league
router.delete('/:leagueId', checkAuth, async (req, res) => {
  const { leagueId } = req.params;
  try {
    await admin.firestore().collection('leagues').doc(leagueId).delete();
    res.status(200).json({ message: 'League deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get user points in a league
router.get('/:leagueId/points', checkAuth, async (req, res) => {
  const { leagueId } = req.params;
  try {
    const pointsSnapshot = await admin
      .firestore()
      .collection('leagues')
      .doc(leagueId)
      .collection('points')
      .get();
    const points = pointsSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
    res.status(200).json(points);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all leagues with their points
router.get('/', checkAuth, async (req, res) => {
  try {
    const leaguesSnapshot = await admin.firestore().collection('leagues').get();
    if (leaguesSnapshot.empty) {
      return res.status(404).json({ error: 'No leagues found' });
    }

    const leagues = [];
    for (const leagueDoc of leaguesSnapshot.docs) {
      const leagueData = leagueDoc.data();
      const pointsSnapshot = await admin
        .firestore()
        .collection('leagues')
        .doc(leagueDoc.id)
        .collection('points')
        .get();

      pointsSnapshot.docs.map((doc) => {
        console.log('Points', doc.data());
      });
      const totalPoints = pointsSnapshot.docs.reduce(
        (sum, doc) => sum + (doc.data().points || 0),
        0
      );
      leagues.push({ id: leagueDoc.id, ...leagueData, totalPoints });
    }

    res.status(200).json(leagues);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
