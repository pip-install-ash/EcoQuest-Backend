const express = require("express");
const admin = require("firebase-admin");
const checkAuth = require("../../middleware/authentication");
const createResponse = require("../../utils/helper-functions");

const router = express.Router();

// Create league
router.post("/create", checkAuth, async (req, res) => {
  const {
    leagueName,
    numberOfPlayers,
    userIDs = [],
    createdBy,
    isPrivate,
  } = req.body;

  if (!createdBy) {
    return res
      .status(400)
      .json(createResponse(false, "Missing required fields", null));
  }

  try {
    let joiningCode = null;

    // Generate a joining code if the league is private
    if (isPrivate) {
      joiningCode = Math.floor(100000 + Math.random() * 900000).toString();
    }

    // Create the league document
    const leagueRef = await admin
      .firestore()
      .collection("leagues")
      .add({
        leagueName,
        numberOfPlayers,
        userIDs,
        createdBy,
        isPrivate: isPrivate || false,
        joiningCode, // Add the joining code if applicable
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

    res.status(201).json(
      createResponse(true, "League created successfully", {
        id: leagueRef.id,
      })
    );
  } catch (error) {
    console.error("Error creating league:", error);
    res
      .status(500)
      .json(createResponse(false, "Failed to create league", null));
  }
});

// Get league by userID
router.get("/get/:userID", checkAuth, async (req, res) => {
  const { userID } = req.params;

  if (!userID) {
    return res.status(400).json(createResponse(false, "Missing userID", null));
  }

  try {
    const leaguesRef = admin.firestore().collection("leagues");
    const snapshot = await leaguesRef
      .where("userIDs", "array-contains", userID)
      .get();

    if (snapshot.empty) {
      return res
        .status(404)
        .json(
          createResponse(false, "No league found for the given userID", null)
        );
    }

    const league = snapshot.docs[0];

    res.status(200).json(
      createResponse(true, "League retrieved successfully", {
        id: league.id,
        data: league.data(),
      })
    );
  } catch (error) {
    res.status(500).json(createResponse(false, "Failed to get league", null));
  }
});

// Add user to league
router.post("/add-user-to-league", checkAuth, async (req, res) => {
  const { userID, leagueID } = req.body;

  if (!userID || !leagueID) {
    return res
      .status(400)
      .json(createResponse(false, "Missing userID or leagueID", null));
  }

  try {
    const leagueRef = admin.firestore().collection("leagues").doc(leagueID);
    const leagueDoc = await leagueRef.get();

    if (!leagueDoc.exists) {
      return res
        .status(404)
        .json(
          createResponse(false, "No league found for the given leagueID", null)
        );
    }

    const leagueData = leagueDoc.data();
    if (leagueData.userIDs.includes(userID)) {
      return res
        .status(400)
        .json(createResponse(false, "User already in the league", null));
    }

    if (leagueData.userIDs.length >= leagueData.numberOfPlayers) {
      return res
        .status(400)
        .json(createResponse(false, "League is already full", null));
    }

    await leagueRef.update({
      userIDs: admin.firestore.FieldValue.arrayUnion(userID),
    });

    res
      .status(200)
      .json(createResponse(true, "User added to league successfully", null));
  } catch (error) {
    res
      .status(500)
      .json(createResponse(false, "Failed to add user to league", null));
  }
});

// Remove user from league
router.post("/remove-user-from-league", checkAuth, async (req, res) => {
  const { userID, leagueID } = req.body;

  if (!userID || !leagueID) {
    return res
      .status(400)
      .json(createResponse(false, "Missing userID or leagueID", null));
  }

  try {
    const leagueRef = admin.firestore().collection("leagues").doc(leagueID);
    const leagueDoc = await leagueRef.get();

    if (!leagueDoc.exists) {
      return res
        .status(404)
        .json(
          createResponse(false, "No league found for the given leagueID", null)
        );
    }

    await leagueRef.update({
      userIDs: admin.firestore.FieldValue.arrayRemove(userID),
    });

    res
      .status(200)
      .json(
        createResponse(true, "User removed from league successfully", null)
      );
  } catch (error) {
    res
      .status(500)
      .json(createResponse(false, "Failed to remove user from league", null));
  }
});

// Get all leagues with connected points against userIDs
router.get("/all-leagues-with-points", checkAuth, async (req, res) => {
  try {
    const leaguesRef = admin.firestore().collection("leagues");
    const snapshot = await leaguesRef.get();

    if (snapshot.empty) {
      return res
        .status(404)
        .json(createResponse(false, "No leagues found", null));
    }

    const leagues = [];
    for (const doc of snapshot.docs) {
      const leagueData = doc.data();
      const userPointsPromises = leagueData.userIDs.map(async (userID) => {
        const pointsRef = admin.firestore().collection("points").doc(userID);
        const pointsDoc = await pointsRef.get();
        return {
          userID,
          ecoPoints: pointsDoc.exists ? pointsDoc.data().ecoPoints : 0,
          pointsDoc: pointsDoc.exists ? pointsDoc.data() : null,
        };
      });

      const userPoints = await Promise.all(userPointsPromises);
      const totalPoints = userPoints.reduce(
        (acc, user) => acc + user.ecoPoints,
        0
      );
      const averagePoints = userPoints.length
        ? totalPoints / userPoints.length
        : 0;

      leagues.push({
        id: doc.id,
        data: leagueData,
        averageEcoPoints: averagePoints,
        userPoints,
      });
    }

    res
      .status(200)
      .json(
        createResponse(
          true,
          "Leagues with average ecoPoints and points documents retrieved successfully",
          leagues
        )
      );
  } catch (error) {
    res
      .status(500)
      .json(createResponse(false, "Failed to get leagues with points", null));
  }
});

// Join private league
router.post("/join-private-league", checkAuth, async (req, res) => {
  const { joiningCode, userID } = req.body;

  if (!joiningCode || !userID) {
    return res
      .status(400)
      .json(createResponse(false, "Missing joiningCode or userID", null));
  }

  try {
    const leaguesRef = admin.firestore().collection("leagues");
    const snapshot = await leaguesRef
      .where("joiningCode", "==", joiningCode)
      .get();

    if (snapshot.empty) {
      return res
        .status(404)
        .json(
          createResponse(
            false,
            "No league found with the given joiningCode",
            null
          )
        );
    }

    const leagueDoc = snapshot.docs[0];
    const leagueData = leagueDoc.data();

    if (leagueData.userIDs.includes(userID)) {
      return res
        .status(400)
        .json(createResponse(false, "User already in the league", null));
    }

    if (leagueData.userIDs.length >= leagueData.numberOfPlayers) {
      return res
        .status(400)
        .json(createResponse(false, "League is already full", null));
    }

    await leagueDoc.ref.update({
      userIDs: admin.firestore.FieldValue.arrayUnion(userID),
    });

    res
      .status(200)
      .json(
        createResponse(true, "User joined private league successfully", null)
      );
  } catch (error) {
    res
      .status(500)
      .json(createResponse(false, "Failed to join private league", null));
  }
});

// Join public league
router.post("/join-public-league", checkAuth, async (req, res) => {
  const { leagueID, userID } = req.body;

  if (!leagueID || !userID) {
    return res
      .status(400)
      .json(createResponse(false, "Missing leagueID or userID", null));
  }

  try {
    const leagueRef = admin.firestore().collection("leagues").doc(leagueID);
    const leagueDoc = await leagueRef.get();

    if (!leagueDoc.exists) {
      return res
        .status(404)
        .json(
          createResponse(false, "No league found with the given leagueID", null)
        );
    }

    const leagueData = leagueDoc.data();

    if (leagueData.userIDs.includes(userID)) {
      return res
        .status(400)
        .json(createResponse(false, "User already in the league", null));
    }

    if (leagueData.userIDs.length >= leagueData.numberOfPlayers) {
      return res
        .status(400)
        .json(createResponse(false, "League is already full", null));
    }

    await leagueRef.update({
      userIDs: admin.firestore.FieldValue.arrayUnion(userID),
    });

    res
      .status(200)
      .json(
        createResponse(true, "User joined public league successfully", null)
      );
  } catch (error) {
    res
      .status(500)
      .json(createResponse(false, "Failed to join public league", null));
  }
});

module.exports = router;
