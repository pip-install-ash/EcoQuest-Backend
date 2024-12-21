const express = require('express');
const admin = require('firebase-admin');
const checkAuth = require('../../middleware/authentication');
const createResponse = require('../../utils/helper-functions');

const router = express.Router();

// Get all users by name or email
router.get('/search/:name', checkAuth, async (req, res) => {
  const { name } = req.params;

  if (!name) {
    return res
      .status(400)
      .json(createResponse(false, 'Name parameter is required'));
  }

  try {
    const usersRef = admin.firestore().collection('userProfiles');
    const snapshot = await usersRef.get();

    const users = snapshot.docs
      .map((doc) => doc.data())
      .filter((user) => {
        return (
          user.userName.toLowerCase().includes(name.toLowerCase()) ||
          user.email.toLowerCase().includes(name.toLowerCase())
        );
      });

    if (users.length === 0) {
      return res
        .status(404)
        .json(createResponse(false, 'No matching users found'));
    }

    return res.status(200).json(createResponse(true, 'Users found', users));
  } catch (error) {
    return res
      .status(500)
      .json(createResponse(false, 'Error fetching users', error.message));
  }
});

router.put('/map-update', checkAuth, async (req, res) => {
  const { gameInitMap } = req.body;
  const user = req.user;

  if (!gameInitMap) {
    return res.status(400).json(createResponse(false, 'Game Map is required'));
  }

  try {
    const userRef = admin
      .firestore()
      .collection('userProfiles')
      .doc(user.user_id);

    const data = {
      gameInitMap: gameInitMap,
    };

    await userRef.update(data);

    return res.status(200).json(createResponse(true, 'User updated'));
  } catch (error) {
    return res
      .status(500)
      .json(createResponse(false, 'Error updating user', error.message));
  }
});

module.exports = router;
