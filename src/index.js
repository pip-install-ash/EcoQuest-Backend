const express = require("express");
const admin = require("firebase-admin");
const serviceAccount = require("./keys.json");
const assetRoutes = require("./routes/assets");
const pointsRoutes = require("./routes/points");
const leagueRoutes = require("./routes/league");
const userRoutes = require("./routes/users");
const buildingRoutes = require("./routes/buildings");
const cors = require("cors");

const checkAuth = require("./middleware/authentication");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const app = express();
const port = process.env.PORT || 4000;

app.use(
  cors({
    origin: true,
    credentials: true,
  })
);
app.use(express.json());
// Middleware to log request method and URL
app.use((req, res, next) => {
  console.warn(
    `👉🏻 Request Method: ${req.method}, Request URL: ${req.originalUrl} 👈🏻`
  );
  next();
});

app.get("/", (req, res) => {
  res.send("Welcome to the Firebase Authentication and Post Management!");
});

// Register new user
app.post("/register", async (req, res) => {
  const { userName, email, password } = req.body;

  if (!userName || !email || !password) {
    return res.status(400).json({
      message: "Username, email and password are required",
      success: false,
    });
  }

  try {
    // Create a new user in Firebase Authentication
    const userRecord = await admin.auth().createUser({
      email,
      password,
    });

    console.log("Successfully created user:", userRecord.uid);

    // Add user profile to Firestore in the userProfiles collection
    await admin.firestore().collection("userProfiles").doc(userRecord.uid).set({
      userID: userRecord.uid,
      userName,
      email,
      gameInitMap: "",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return res.status(201).json({
      message: "User registered and profile created successfully",
      success: true,
    });
  } catch (error) {
    console.error("Error creating user or profile:", error);
    return res.status(500).json({ message: error.message, success: false });
  }
});

// Log in a user
app.post("/login", (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res
      .status(500)
      .json({ message: "Email and password are required", success: false });
  }

  admin
    .auth()
    .getUserByEmail(email)
    .then((userRecord) => {
      if (password === userRecord.providerData[0].providerId) {
        req.session.user = userRecord.uid;
        return res.json({
          message: "User Login successful",
          success: true,
        });
      } else {
        return res
          .status(401)
          .json({ message: "Login failed", success: false });
      }
    })
    .catch((error) => {
      console.error("Error getting user:", error);
      if (error.code === "auth/user-not-found") {
        res.status(404).json({
          message: "User doesn't exist. Please register first",
          success: false,
        });
      } else {
        res.status(401).json({ message: "Login failed", success: false });
      }
    });
});

app.get("/user-details", checkAuth, async (req, res) => {
  const user = req.user;
  const userPointsRef = admin
    .firestore()
    .collection("userPoints")
    .doc(user.user_id);

  const userPointsDoc = await userPointsRef.get();

  if (!userPointsDoc.exists) {
    await userPointsRef.set({
      coins: 200000,
      ecoPoints: 200,
      electricity: 200000,
      garbage: 0,
      population: 0,
      userId: user.user_id,
      water: 200,
    });
  }
  await admin
    .firestore()
    .collection("userProfiles")
    .doc(user.user_id)
    .get()
    .then((doc) => {
      res.status(200).json({
        user_id: doc.data().userID,
        email: doc.data().email,
        userName: doc.data().userName,
        gameInitMap: doc.data()?.gameInitMap,
      });
    })
    .catch((error) => {
      console.error("Error getting user:", error);
      if (error.code === "auth/user-not-found") {
        res.status(404).json({
          message: "User doesn't exist. Please register first",
          success: false,
        });
      } else {
        res.status(401).json({ message: "Login failed", success: false });
      }
    });
});
// Log out a user
app.get("/logout", (req, res) => {
  req.session.user = null;
  res.json({ message: "Logged out", success: true });
});

app.use("/api", assetRoutes);
app.use("/api/points", pointsRoutes);
app.use("/api/league-stats", leagueRoutes); // Get league stats for resuming the league Game against a user.
app.use("/api/leagues", leagueRoutes);
app.use("/api/users", userRoutes);
app.use("/api/buildings", buildingRoutes);

// Create a new asset with additional data (requires authentication)
app.post("/buildings/new", checkAuth, (req, res) => {
  const { buildingId, isCreated, isForbidden, isDestroyed, isRotate, x, y } =
    req.body;

  // if (
  //   buildingId === undefined ||
  //   isCreated === undefined ||
  //   isForbidden === undefined ||
  //   isRotate === undefined ||
  //   x === undefined ||
  //   y === undefined
  // ) {
  //   return res
  //     .status(500)
  //     .json({ message: 'All fields are required', success: false });
  // }

  const db = admin.firestore();
  const buildingRef = db.collection("buildings").doc();

  const data = {
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  // for optional data
  if (buildingId !== undefined) data.buildingId = buildingId;
  if (isCreated !== undefined) data.isCreated = isCreated;
  if (isForbidden !== undefined) data.isForbidden = isForbidden;
  if (isRotate !== undefined) data.isRotate = isRotate;
  if (isDestroyed !== undefined) data.isDestroyed = isDestroyed;
  if (x !== undefined) data.x = x;
  if (y !== undefined) data.y = y;

  buildingRef
    .set(data)
    .then(() => {
      return res.json({ message: "Asset created", success: true });
    })
    .catch((error) => {
      console.error("Error creating asset:", error);
      return res.status(500).json({ message: error.message, success: false });
    });
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
