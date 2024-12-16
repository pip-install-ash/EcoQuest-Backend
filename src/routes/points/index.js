const express = require("express");
const admin = require("firebase-admin");
const checkAuth = require("../../middleware/authentication");
const createResponse = require("../../utils/helper-functions");

const router = express.Router();

// Create User points by userID
router.post("/create", checkAuth, async (req, res) => {
  const { userID, ecoPoints, coins, garbage, population, electricity, water } =
    req.body;
  try {
    await admin.firestore().collection("userPoints").doc(userID).set({
      userID,
      ecoPoints,
      coins,
      garbage,
      population,
      electricity,
      water,
    });
    res
      .status(201)
      .send(createResponse(true, "User points created successfully"));
  } catch (error) {
    res.status(500).send(createResponse(false, "Error creating user points"));
  }
});

// Get Points by userID
router.get("/all-points", checkAuth, async (req, res) => {
  const userID = req.user.user_id;
  try {
    const doc = await admin
      .firestore()
      .collection("userPoints")
      .doc(userID)
      .get();
    if (!doc.exists) {
      return res
        .status(404)
        .send(createResponse(false, "User points not found"));
    }
    res
      .status(200)
      .send(
        createResponse(true, "User points retrieved successfully", doc.data())
      );
  } catch (error) {
    res.status(500).send(createResponse(false, "Error getting user points"));
  }
});

// Update Points by userID
router.put("/update", checkAuth, async (req, res) => {
  const userID = req.user.user_id;
  const { ecoPoints, coins, garbage, population, electricity, water } =
    req.body;

  // Filter out undefined fields
  const updateData = {};
  if (ecoPoints !== undefined) updateData.ecoPoints = ecoPoints;
  if (coins !== undefined) updateData.coins = coins;
  if (garbage !== undefined) updateData.garbage = garbage;
  if (population !== undefined) updateData.population = population;
  if (electricity !== undefined) updateData.electricity = electricity;
  if (water !== undefined) updateData.water = water;

  try {
    await admin
      .firestore()
      .collection("userPoints")
      .doc(userID)
      .update(updateData);
    res.status(200).send(createResponse(true, "Points updated successfully"));
  } catch (error) {
    console.log("Error: >>", error);
    res.status(500).send(createResponse(false, "Error updating user points"));
  }
});

// Get all users with their ecoPoints
router.get("/global/leaderboard", checkAuth, async (req, res) => {
  try {
    const usersRef = admin.firestore().collection("userProfiles");
    const snapshot = await usersRef.get();

    if (snapshot.empty) {
      return res
        .status(404)
        .json(createResponse(false, "No users found", null));
    }

    const usersWithEcoPointsPromises = snapshot.docs.map(async (userDoc) => {
      const userData = userDoc.data();
      const pointsRef = admin
        .firestore()
        .collection("userPoints")
        .doc(userDoc.id);
      const pointsDoc = await pointsRef.get();
      const ecoPoints = pointsDoc.exists ? pointsDoc.data().ecoPoints : 0;

      return {
        userID: userDoc.id,
        userName: userData.userName,
        ecoPoints,
      };
    });

    const usersWithEcoPoints = await Promise.all(usersWithEcoPointsPromises);
    usersWithEcoPoints.sort((a, b) => b.ecoPoints - a.ecoPoints);

    const userListUI = usersWithEcoPoints.map((user, index) => [
      index + 1,
      user.userName,
      user.ecoPoints,
    ]);

    res.status(200).json(
      createResponse(true, "Users with eco points retrieved successfully", {
        users: usersWithEcoPoints,
        userListUI,
      })
    );
  } catch (error) {
    console.error("Error getting users with eco points:", error);
    res
      .status(500)
      .json(createResponse(false, "Failed to get users with ecoPoints", null));
  }
});

// Calculate average ecoPoints by league
router.get("/league/leaderboard", checkAuth, async (req, res) => {
  try {
    const leagueStatsRef = admin.firestore().collection("leagueStats");
    const leaguesRef = admin.firestore().collection("leagues");
    const snapshot = await leagueStatsRef.get();

    if (snapshot.empty) {
      return res
        .status(404)
        .json(createResponse(false, "No leagues found", null));
    }

    const leagueEcoPointsMap = {};

    snapshot.docs.forEach((doc) => {
      const data = doc.data();
      const leagueID = data.leagueId;
      const ecoPoints = data.ecoPoints || 0;

      if (!leagueEcoPointsMap[leagueID]) {
        leagueEcoPointsMap[leagueID] = { totalEcoPoints: 0, count: 0 };
      }

      leagueEcoPointsMap[leagueID].totalEcoPoints += ecoPoints;
      leagueEcoPointsMap[leagueID].count += 1;
    });

    const leagueEcoPointsPromises = Object.keys(leagueEcoPointsMap).map(
      async (leagueID) => {
        const leagueDocRef = await leaguesRef.doc(leagueID).get();
        const leagueName = leagueDocRef.exists
          ? leagueDocRef.data().leagueName
          : "Unknown League";
        const { totalEcoPoints, count } = leagueEcoPointsMap[leagueID];
        const averageEcoPoints = totalEcoPoints / count;

        return {
          leagueID,
          leagueName,
          averageEcoPoints,
        };
      }
    );

    const leagueEcoPoints = await Promise.all(leagueEcoPointsPromises);
    leagueEcoPoints.sort((a, b) => b.averageEcoPoints - a.averageEcoPoints);

    const leagueListUI = leagueEcoPoints.map((league, index) => [
      index + 1,
      league.leagueName,
      league.averageEcoPoints,
    ]);

    res.status(200).json(
      createResponse(
        true,
        "Average eco points by league retrieved successfully",
        {
          leagues: leagueEcoPoints,
          leagueListUI,
        }
      )
    );
  } catch (error) {
    console.error("Error getting average eco points by league:", error);
    res
      .status(500)
      .json(
        createResponse(
          false,
          "Failed to get average eco points by league",
          null
        )
      );
  }
});

module.exports = router;
