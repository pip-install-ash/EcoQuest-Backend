const express = require("express");
const admin = require("firebase-admin");
const checkAuth = require("../../middleware/authentication");
const createResponse = require("../../utils/helper-functions");

const router = express.Router();

// Get messages for a league
router.get("/messages/:leagueId", checkAuth, async (req, res) => {
  try {
    const { leagueId } = req.params;
    const { limit = 50, before } = req.query;

    let query = admin
      .firestore()
      .collection("leagueChats")
      .doc(leagueId)
      .collection("messages")
      .orderBy("timestamp", "desc")
      .limit(parseInt(limit));

    if (before) {
      const beforeDate = new Date(before);
      query = query.where("timestamp", "<", beforeDate);
    }

    const messagesSnapshot = await query.get();
    const messages = messagesSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    res.json(createResponse(true, "Messages fetched successfully", messages));
  } catch (error) {
    console.error("Error fetching messages:", error);
    res
      .status(500)
      .json(createResponse(false, "Error fetching messages", error.message));
  }
});

module.exports = router;
