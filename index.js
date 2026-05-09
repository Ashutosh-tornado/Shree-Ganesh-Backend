require("dotenv").config();

const express = require("express");
const crypto = require("crypto");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");


const cors = require("cors");
const app = express();

app.use(cors());  
app.use(express.json());

const Razorpay = require("razorpay");

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});



// ================= SCHEMA =================
const userSchema = new mongoose.Schema({
  name: String,
  email: String,
  password: String
});

const User = mongoose.model("User", userSchema);

// ================= PRODUCT SCHEMA =================

const productSchema = new mongoose.Schema({
  name: String,
  price: Number,
  category: {
    type: String,
    enum: [
    "Almonds",
    "Cashews",
    "Pistachios",
    "Raisins",
    "Walnuts",
    "Dry Fig",
    "Dates",
    "Apricots",
    "Mixed"
  ]
  },
    isPremium: {
    type: Boolean,
    default: false
  },
  weight: String,
  stock: Number,
  image: String,
  description: String,
});

const Product = mongoose.model("Product", productSchema);

// Cart Schema xxxxxxxxxxxxxxxxxxxxxxx----------------xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

const cartSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Product"
  },
  quantity: {
    type: Number,
    default: 1
  }
});

const Cart = mongoose.model("Cart", cartSchema);

//Order Schema xxxxxxxxxxxxxxxxxx------------------------xxxxxxxxxxxxxxxxxxxxxxxxxxxx


const orderSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },

  items: [
    {
      productId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Product"
      },

      // 🔥 IMPORTANT SNAPSHOT DATA
      name: String,
      price: Number,
      image: String,

      quantity: Number
    }
  ],

  totalAmount: {
    type: Number,
    required: true
  },

  status: {
    type: String,
    enum: ["Pending", "Paid", "Shipped", "Delivered", "Cancelled"],
    default: "Pending"
  },

  // 🔥 PAYMENT
  paymentId: String,
  paymentMethod: {
    type: String,
    default: "COD" // or "Razorpay"
  }

}, {
  timestamps: true // 🔥 auto createdAt + updatedAt
});

const Order = mongoose.model("Order", orderSchema);

module.exports = Order;

// ================= ROUTES =================

// 🔍 GET ALL USERS
app.get("/users", async (req, res) => {
  try {
    const users = await User.find();

    res.json({
      message: "Users fetched ✅",
      users
    });

  } catch (error) {
    res.status(500).json({
      message: "Error ❌",
      error: error.message
    });
  }
});


// 🔐 SIGNUP (CREATE USER)
app.post("/signup", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        message: "All fields required ❌"
      });
    }

// 🔥 2. DUPLICATE CHECK 

    const existingUser = await User.findOne({ email });

    if (existingUser) {
      return res.status(400).json({
        message: "User already exists ❌"
      });
    }


    const hashedPassword = await bcrypt.hash(password, 10);

    const user = new User({
      name,
      email,
      password: hashedPassword
    });

    await user.save();

  res.status(201).json({
  message: "User created ✅",
  user: {
    _id: user._id,
    name: user.name,
    email: user.email
  }
});

  } catch (error) {
    res.status(500).json({
      message: "Server error ❌",
      error: error.message
    });
  }
});


// 🔑 LOGIN
app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(400).json({
        message: "User not found ❌"
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(400).json({
        message: "Invalid password ❌"
      });
    }

    const token = jwt.sign(
      { userId: user._id },
      "secret123",
      { expiresIn: "1h" }
    );

    res.json({
      message: "Login successful ✅",
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email
      }
    });

  } catch (error) {
    res.status(500).json({
      message: "Server error ❌",
      error: error.message
    });
  }
});

// 🛒 ADD PRODUCT

app.post("/product", async (req,res)=>{
  try {
    const {name, price, category, weight, stock, image, description,isPremium} = req.body;

    const product = new Product({
      name,
      price,
      category,
      weight,
      stock,
      image,
      description,
      isPremium
    })

    await product.save();

    res.json({
      message: "Product added",
      product
    });


  } catch (error) {
      res.status(500).json({
        message:"Error",
        error: error.message
      });    
  }
});

// 📦 GET PRODUCTS

app.get("/products", async (req,res)=>{
  try {
    const products = await Product.find();

    res.json({
      message: "Products Fetched",
      products
    });


  } catch (error) {
      res.status(500).json({
        message:"Error",
        error: error.message
      });
  }
});

// 🗑️ DELETE PRODUCT
app.delete("/product/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const deletedProduct = await Product.findByIdAndDelete(id);

    res.json({
      message: "Product deleted ✅",
      product: deletedProduct
    });

  } catch (error) {
    res.status(500).json({
      message: "Error ❌",
      error: error.message
    });
  }
});

app.get("/products/:id", async (req, res) => {

  try {

    const product = await Product.findById(req.params.id);

    res.json({
      product
    });

  } catch (error) {

    res.status(500).json({
      message: "Error fetching product"
    });

  }

});

// Middleware

const authMiddleware = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization; // "Bearer xxx"

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "No token ❌" });
    }

    const token = authHeader.split(" ")[1]; // actual JWT

    const decoded = jwt.verify(token, "secret123"); // same secret ✔️

    req.user = decoded;
    next();

  } catch (error) {
    return res.status(401).json({ message: "Invalid token ❌" });
  }
};

app.get("/profile", authMiddleware, (req, res) => {
  res.json({
    message: "Protected data ✅",
    user: req.user
  });
});

// Add To Cart API

app.post("/cart", authMiddleware, async (req, res) => {
  try {
    const { productId, quantity } = req.body;

    const cartItem = new Cart({
      userId: req.user.userId,
      productId,
      quantity
    });

    await cartItem.save();

    res.json({
      message: "Added to cart ✅",
      cartItem
    });

  } catch (error) {
    res.status(500).json({
      message: "Error ❌",
      error: error.message
    });
  }
});

// GET CART

app.get("/cart", authMiddleware, async (req, res) => {
  try {
    const cart = await Cart.find({ userId: req.user.userId })
      .populate("productId");

    res.json({
      message: "Cart fetched ✅",
      cart
    });

  } catch (error) {
    res.status(500).json({
      message: "Error ❌",
      error: error.message
    });
  }
});

// Update Quantity

app.put("/cart/:id", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { quantity } = req.body;

    const updatedItem = await Cart.findByIdAndUpdate(
      id,
      { quantity },
      { new: true }
    );

    res.json({
      message: "Quantity updated ✅",
      cartItem: updatedItem
    });

  } catch (error) {
    res.status(500).json({
      message: "Error ❌",
      error: error.message
    });
  }
});

// Remove From Cart

app.delete("/cart/:id", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    const deletedItem = await Cart.findByIdAndDelete(id);

    res.json({
      message: "Item removed from cart 🗑️",
      cartItem: deletedItem
    });

  } catch (error) {
    res.status(500).json({
      message: "Error ❌",
      error: error.message
    });
  }
});


// Checkout API / Create Order xxxxxxxxxxx===================xxxxxxxxxxxxxxxxxx ///  COD

app.post("/order", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;

    // 1️⃣ Get cart items
    const cartItems = await Cart.find({ userId }).populate("productId");

    if (cartItems.length === 0) {
      return res.status(400).json({
        message: "Cart is empty ❌"
      });
    }

    // 2️⃣ Calculate total
    let total = 0;

    const items = cartItems.map(item => {
      total += item.productId.price * item.quantity;

      return {
        productId: item.productId._id,
          name: item.productId.name,
  price: item.productId.price,
  image: item.productId.image,
        quantity: item.quantity
      };
    });

    // 3️⃣ Create order
    const order = new Order({
      userId,
      items,
      totalAmount: total
    });

    await order.save();

    // 4️⃣ Clear cart
    await Cart.deleteMany({ userId });

  res.json({
  message: "Order placed successfully ✅",
  order: {
    _id: order._id,
    totalAmount: order.totalAmount,
    status: order.status,
    createdAt: order.createdAt
  }
});

  } catch (error) {
    res.status(500).json({
      message: "Error ❌",
      error: error.message
    });
  }
});

// Razorpay Create Order API 
app.post("/create-order", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;

    // 🔥 Cart fetch
    const cartItems = await Cart.find({ userId }).populate("productId");

    if (cartItems.length === 0) {
      return res.status(400).json({
        message: "Cart is empty ❌"
      });
    }

    // 🔥 Total calculate
    let total = 0;

    const items = cartItems.map(item => {
      total += item.productId.price * item.quantity;

      return {
        productId: item.productId._id,
        quantity: item.quantity
      };
    });

    // 🔥 DB order create (Pending)
    const orderFromDB = new Order({
      userId,
      items,
      totalAmount: total,
      status: "Pending"
    });

    await orderFromDB.save();

    // 🔥 Razorpay order create
    const options = {
      amount: total * 100,
      currency: "INR",
      receipt: "receipt_" + Date.now()
    };

    const razorpayOrder = await razorpay.orders.create(options);

    // 🔥 Send response
    res.json({
      order: razorpayOrder,
      dbOrderId: orderFromDB._id
    });

  } catch (error) {
    res.status(500).json({
      message: "Error ❌",
      error: error.message
    });
  }
});

// GET Orders xxxxxxxxxxxxxxxxx------------------xxxxxxxxxxxxxxxxxx

app.get("/orders", authMiddleware, async (req, res) => {
  try {

    const userId = req.user.userId;

    const orders = await Order.find({ userId: req.user.userId })
      .sort({ createdAt: -1 });


    res.json({
      message: "Orders fetched ✅",
      orders
    });

  } catch (error) {
    res.status(500).json({
      message: "Error ❌",
      error: error.message
    });
  }
});


// Payment API //

// app.post("/verify-payment", authMiddleware, async (req, res) => {
//   try {
//     const {
//       razorpay_order_id,
//       razorpay_payment_id,
//       razorpay_signature,
//       orderId   // 🔥 apna DB orderId
//     } = req.body;

//     const body = razorpay_order_id + "|" + razorpay_payment_id;

//     const expectedSignature = crypto
//       .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
//       .update(body.toString())
//       .digest("hex");

//     if (expectedSignature === razorpay_signature) {

//       // ✅ DB order update
//       const updatedOrder = await Order.findByIdAndUpdate(
//         orderId,
//         {
//           status: "Paid",
//           paymentId: razorpay_payment_id
//         },
//         { new: true }
//       );

//       res.json({
//         message: "Payment verified ✅",
//         order: updatedOrder
//       });

//     } else {
//       res.status(400).json({
//         message: "Invalid payment ❌"
//       });
//     }

//   } catch (error) {
//     res.status(500).json({
//       message: "Error ❌",
//       error: error.message
//     });
//   }
// });

// ================= COMMENTED ROUTES =================

// ✏️ UPDATE USER
/*
app.put("/user/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, password } = req.body;

    const updatedUser = await User.findByIdAndUpdate(
      id,
      { name, email, password },
      { new: true }
    );

    res.json({
      message: "User updated",
      user: updatedUser
    });

  } catch (error) {
    res.status(500).json({
      message: "Error",
      error: error.message
    });
  }
});
*/

// 🗑️ DELETE USER
/*
app.delete("/user/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const deletedUser = await User.findByIdAndDelete(id);

    res.json({
      message: "User deleted ✅",
      user: deletedUser
    });

  } catch (error) {
    res.status(500).json({
      message: "Error ❌",
      error: error.message
    });
  }
});
*/


// ================= DB CONNECT =================
mongoose.connect(process.env.MONGO_URI)
.then(() => {
  console.log("MongoDB connected ✅");

  app.listen(5000, () => {
    console.log("Server running on port 5000 🚀");
  });

})
.catch((err) => {
  console.log("DB Error:", err);
});

