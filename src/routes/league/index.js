const express = require("express");
const admin = require("firebase-admin");
const checkAuth = require("../../middleware/authentication");
const createResponse = require("../../utils/helper-functions");

const router = express.Router();

async function setDefaultStatsValue({
  leagueId,
  userId,
  lastLogined,
  coins,
  ecoPoints,
  electricity,
  garbage,
  population,
  water,
  gameInitMap,
}) {
  const leagueStatsRef = admin.firestore().collection("leagueStats").doc();
  await leagueStatsRef.set({
    leagueId,
    userId,
    lastLogined: lastLogined || "",
    coins: coins || 200000,
    ecoPoints: ecoPoints || 200,
    electricity: electricity || 200000,
    garbage: garbage || 0,
    population: population || 0,
    water: water || 200,
    gameInitMap: "",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

async function getLeaguesWithPointsV1(snapshot) {
  const leagues = [];
  for (const doc of snapshot.docs) {
    const leagueData = doc.data();
    const userPointsPromises = leagueData.userIDs.map(async (userID) => {
      const pointsRef = admin.firestore().collection("userPoints").doc(userID);
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
    const userPresent = leagueData.userIDs.length;
    const averagePoints = userPresent ? totalPoints / userPresent : 0;

    leagues.push({
      id: doc.id,
      data: {
        leagueName: leagueData.leagueName,
        userPresent,
        numberOfPlayers: Number(leagueData.numberOfPlayers),
        createdBy: leagueData.createdBy,
        joiningCode: leagueData.joiningCode,
        isPrivate: leagueData.isPrivate,
      },
      averageEcoPoints: averagePoints,
      // userPoints,
    });
  }
  return leagues;
}

async function getLeaguesWithPoints(snapshot) {
  const leagues = [];
  for (const doc of snapshot.docs) {
    const leagueData = doc.data();
    const leagueID = doc.id;

    const pointsQuery = admin
      .firestore()
      .collection("leagueStats")
      .where("leagueId", "==", leagueID);
    const pointsSnapshot = await pointsQuery.get();

    const userPoints = pointsSnapshot.docs.map((pointsDoc) => ({
      userID: pointsDoc.data().userId,
      lastLogined: pointsDoc.data().lastLogined
        ? pointsDoc.data().lastLogined.toDate().toISOString()
        : "",
      ecoPoints: pointsDoc.data().ecoPoints || 0,
      pointsDoc: pointsDoc.data(),
    }));

    const totalPoints = userPoints.reduce(
      (acc, user) => acc + user.ecoPoints,
      0
    );
    const userPresent = leagueData.userIDs.length;
    const averagePoints = userPresent ? totalPoints / userPresent : 0;

    leagues.push({
      id: doc.id,
      data: {
        leagueName: leagueData.leagueName,
        userPresent,
        numberOfPlayers: Number(leagueData.numberOfPlayers),
        createdBy: leagueData.createdBy,
        joiningCode: leagueData.joiningCode,
        isPrivate: leagueData.isPrivate,
        lastLogined: userPoints[0]?.lastLogined || "",
      },
      averageEcoPoints: averagePoints,
      // userPoints,
    });
  }
  return leagues;
}
// Create league
router.post("/create", checkAuth, async (req, res) => {
  const {
    leagueName,
    numberOfPlayers,
    userIDs = [req.user.user_id],
    isPrivate,
  } = req.body;

  const createdBy = req.user.user_id;
  // if (!createdBy) {
  //   return res
  //     .status(400)
  //     .json(createResponse(false, "Missing required fields", null));
  // }

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

    await setDefaultStatsValue({
      leagueId: leagueRef.id,
      userId: createdBy,
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
router.get("/my-leagues", checkAuth, async (req, res) => {
  const userID = req.user.user_id;

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

    const leagues = await getLeaguesWithPoints(snapshot);
    // const league = snapshot.docs[0];
    const leaguesForUI = leagues.map((league) => ({
      name: league.data.leagueName,
      playerJoined: `${league.data.userPresent}/${league.data.numberOfPlayers}`,
      AverageEchoPoints: league.averageEcoPoints.toLocaleString(),
      lastLogin: league.data.lastLogined || "N/A",
      leagueID: league.id,
      playerPresent: league.data.userPresent,
      maxPlayers: league.data.numberOfPlayers,
    }));

    res.status(200).json(
      createResponse(true, "League retrieved successfully", {
        leagues,
        leaguesForUI,
      })
    );
  } catch (error) {
    res.status(500).json(createResponse(false, "Failed to get league", null));
  }
});

// Add user to any-league
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
    await setDefaultStatsValue({
      leagueId: leagueRef.id,
      userId: userID,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
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

    const leagues = await getLeaguesWithPoints(snapshot);
    const leaguesForUI = leagues.map((league) => ({
      name: league.data.leagueName,
      playerJoined: `${league.data.userPresent}/${league.data.numberOfPlayers}`,
      AverageEchoPoints: league.averageEcoPoints.toLocaleString(),
      leagueID: league.id,
      playerPresent: league.data.userPresent,
      maxPlayers: league.data.numberOfPlayers,
    }));

    res
      .status(200)
      .json(
        createResponse(
          true,
          "Leagues with average ecoPoints and points documents retrieved successfully",
          { leagues, leaguesForUI }
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
  const { joiningCode } = req.body;
  const userID = req.user.user_id;

  if (!joiningCode) {
    return res
      .status(400)
      .json(createResponse(false, "Missing joiningCode ", null));
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

    await setDefaultStatsValue({
      leagueId: leaguesRef.id,
      userId: userID,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
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
  const { leagueID } = req.body;
  const userID = req.user.user_id;

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

    await setDefaultStatsValue({
      leagueId: leagueRef.id,
      userId: userID,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
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

// Get league data by leagueID
router.get("/details/:leagueID", checkAuth, async (req, res) => {
  const { leagueID } = req.params;

  if (!leagueID) {
    return res
      .status(400)
      .json(createResponse(false, "Missing leagueID", null));
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
    console.log("lego leag", leagueData);
    let ownerDetails;
    const userPointsPromises = leagueData.userIDs.map(async (userID, index) => {
      const userRef = admin.firestore().collection("userProfiles").doc(userID);
      const userDoc = await userRef.get();
      const userName = userDoc.exists ? userDoc.data().userName : "Unknown";

      const pointsRef = admin.firestore().collection("userPoints").doc(userID);
      const pointsDoc = await pointsRef.get();
      const ecoPoints = pointsDoc.exists ? pointsDoc.data().ecoPoints : 0;
      const coin = pointsDoc.exists ? pointsDoc.data().coins : 0;

      const userIsOwner = leagueData.createdBy === userID;
      if (userIsOwner) {
        ownerDetails = userDoc.data();
      }
      const assetsRef = admin
        .firestore()
        .collection("userAssets")
        .where("userId", "==", userID);
      const assetsSnapshot = await assetsRef.get();
      const assetsDocCount = assetsSnapshot.size;

      return [
        index + 1,
        userName,
        ecoPoints,
        coin,
        assetsDocCount,
        userIsOwner ? 0 : 1,
        0,
        userID,
      ];
    });

    const userData = await Promise.all(userPointsPromises);

    res.status(200).json(
      createResponse(true, "League data retrieved successfully", {
        leagueData: {
          id: leagueID,
          leagueName: leagueData.leagueName,
          numberOfPlayers: leagueData.numberOfPlayers,
          userPresent: leagueData.userIDs.length,
          isPrivate: leagueData.isPrivate,
          joiningCode: leagueData.joiningCode,
          createdAt: leagueData.createdAt,
          owner: {
            email: ownerDetails?.email || "",
            userName: ownerDetails?.userName || "",
          },
        },
        isOwner: ownerDetails?.userID === req.user.user_id,
        userData,
      })
    );
  } catch (error) {
    console.log("ERR>>", error);
    res
      .status(500)
      .json(createResponse(false, "Failed to get league data", null));
  }
});

module.exports = router;
