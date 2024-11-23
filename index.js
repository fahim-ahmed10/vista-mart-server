const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const { MongoClient, ServerApiVersion } = require("mongodb");
require("dotenv").config();
const app = express();
const port = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

//mongodb client
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.kwc9pjc.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

const userCollection = client.db("vistaMart").collection("users");
const productCollection = client.db("vistaMart").collection("products");

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

//middleware

const verifyJWT = (req, res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res.send({ message: "No Token" });
  }
  const token = authorization.split(" ")[1];
  jwt.verify(token, process.env.ACCESS_KEY_TOKEN, (err, decoded) => {
    if (err) {
      return res.send({ message: "Invalid Token" });
    }
    req.decoded = decoded;
    next();
  });
};

//Verify Seller
const verifySeller = async (req, res, next) => {
  try {
    // Check if req.decoded exists and contains an email
    if (!req.decoded || !req.decoded.email) {
      return res.status(401).send({ message: "Unauthorized access" });
    }

    const email = req.decoded.email;

    // Query the user collection
    const query = { email: email };
    const user = await userCollection.findOne(query);

    // Check if the user's role is 'seller'
    if (!user || user.role !== "seller") {
      return res.status(403).send({ message: "Forbidden access" });
    }

    // Proceed to the next middleware or route handler
    next();
  } catch (error) {
    console.error("Error in verifySeller middleware:", error);
    res.status(500).send({ message: "Internal Server Error" });
  }
};

//api

//create user data
app.post("/users", async (req, res) => {
  const user = req.body;
  const query = { email: user.email };
  const existingUser = await userCollection.findOne(query);

  if (existingUser) {
    return res.send({ message: "User already exists" });
  }
  const result = await userCollection.insertOne(user);
  res.send(result);
});

//find user data
app.get("/user/:email", async (req, res) => {
  const email = req.params.email;
  const query = { email: email };
  const result = await userCollection.findOne(query);
  res.send(result);
});

//add product
app.post("/add-products", verifyJWT, verifySeller, async (req, res) => {
  const product = req.body;
  const result = await productCollection.insertOne(product);
  res.send(result);
});

//get all products
app.get("/all-products", async (req, res) => {
  const { title, sort, category, brand, page = 1, limit= 6 } = req.query;

  const query = {}; // We use an empty object to inject filter conditions

  if (title) {
    query.title = { $regex: title, $options: "i" };
  }
  if (category) {
    query.category = { $regex: category, $options: "i" };
  }
  if (brand) {
    query.brand = brand;
  }
  const sortOption = sort === "asc" ? 1 : -1;
  
  const pageNumber = Number(page);
  const limitNumber = Number(limit);

  try {
    const products = await productCollection
      .find(query)
      .skip((pageNumber - 1) * limitNumber)
      .limit(limitNumber)
      .sort({ price: sortOption })
      .toArray();

    const totalProducts = await productCollection.countDocuments(query);

    const productInfo = await productCollection
      .find({}, { projection: { category: 1, brand: 1 } })
      .toArray();

    const brands = [...new Set(productInfo.map((product) => product.brand).filter(brand=> brand))];
    const categories = [
      ...new Set(productInfo.map((product) => product.category).filter(category=> category)),
    ];

    // Send all the data as a single object
    res.json({
      products,
      brands,
      categories,
      totalProducts,
    });
  } catch (error) {
    console.error("Error fetching products:", error);
    res.status(500).json({ error: "Failed to fetch products" });
  }
});

//jwt
app.post("/authentication", (req, res) => {
  const userEmail = req.body;
  const token = jwt.sign(userEmail, process.env.ACCESS_KEY_TOKEN, {
    expiresIn: "10d",
  });
  res.send({ token });
});

app.get("/", (req, res) => {
  res.send("vistamart is running");
});

app.listen(port, () => {
  console.log(`Server is running on port, ${port}`);
});
