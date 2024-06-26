const express = require('express');
const app = express();
const cors = require('cors');
require('dotenv').config()
const jwt = require('jsonwebtoken');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
// const formData = require('form-data');
// const Mailgun = require("mailgun.js");
// const mailgun = new Mailgun(formData);
// const mg = mailgun({
//   apiKey: process.env.MAILGUN_API_KEY, 
//   domain: process.env.MAILGUN_SENDING_API});

const formData = require('form-data');
const Mailgun = require('mailgun.js');
const mailgun = new Mailgun(formData);
const mg = mailgun.client({
  username: 'api',
  key: process.env.MAIL_GUN_API_KEY,
});


const port = process.env.PORT || 8000;
// middleware
app.use(cors());
app.use(express.json());


const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.5wr47xq.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();
    const userCollection = client.db("foodDb").collection("users");
    const menuCollection  = client.db("foodDb").collection("menu");
    const reviewCollection  = client.db("foodDb").collection("reviews");
    const cartCollection  = client.db("foodDb").collection("cart");
    const paymentCollection  = client.db("foodDb").collection("payments");
    const bookingsCollection = client.db("foodDb").collection("bookings");

    // jwt related API
    app.post('/jwt', async(req, res) =>{
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {expiresIn: '1h'})
      res.send({token});

    })    

    // middlewares for
    const verifytoken = (req, res, next) => {
      console.log('inside verify token', req.headers.authorization);
      if(!req.headers.authorization){
        return res.status(401).send({message: 'forbidden-access'});
      }
      const token = req.headers.authorization.split(' ')[1];
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) =>{
        if(err){
          return res.status(401).send({message: 'forbidden-access'});
        }
        req.decoded = decoded;
        next();
      })
      //next();
    }
    // use verify admin after verifyToken
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await userCollection.findOne(query);
      const isAdmin = user?.role === 'admin';
      if (!isAdmin) {
        return res.status(403).send({ message: 'forbidden access' });
      }
      next();
    }
    //user req
    app.get('/users', verifytoken, async (req, res) =>{
      console.log(req.headers);
        const result = await userCollection.find().toArray();
        res.send(result);
    })
    app.get('/users/admin/:email', verifytoken, async (req, res) =>{
      const email = req.params.email;
      if(email !==req.decoded.email){
        return res.status(403).send({ message : 'unauthorized access'})
      }
      const query = {email : email};
      const user = await userCollection.findOne(query);
      let admin = false;
      if(user){
        admin = user?.role === 'admin';
      }
      res.send({admin});
      
    })
    app.delete('/users/:id', async (req, res) =>{
      const id = req.params.id;
      const query = {_id: new ObjectId(id)}
      const result = await userCollection.deleteOne(query);
      res.send(result);
    })
    app.patch('/users/admin/:id', async (req, res) =>{
      const id = req.params.id;
      const filter = {_id: new ObjectId(id)}
      const updatedDoc = {
        $set:{
          role: 'admin'
        }
      }
      const result = await userCollection.updateOne(filter, updatedDoc);
      res.send(result);
    })
    
    app.post('/users', async (req, res) =>{
        const user = req.body;
        const result = await userCollection.insertOne(user);
        res.send(result);
    })


    app.get('/menu', async (req, res) => {
        const result = await menuCollection.find().toArray();
        res.send(result);
    })
    app.post('/menu', verifytoken, verifyAdmin, async (req, res) =>{
      const item = req.body;
      const result = await menuCollection.insertOne(item);
      res.send(result)
    })
    app.delete('/menu/:id', verifytoken, verifyAdmin, async (req, res) =>{
      const id = req.params.id;
      const query ={ _id: new ObjectId(id) };
      const result = await menuCollection.deleteOne(query);
      res.send(result);
    });

    app.get('/menu/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) }
      const result = await menuCollection.findOne(query);
      res.send(result);
    })
    app.patch('/menu/:id', async (req, res) => {
      const item = req.body;
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) }
      const updatedDoc = {
        $set: {
          name: item.name,
          category: item.category,
          price: item.price,
          recipe: item.recipe
          
        }
      }

      const result = await menuCollection.updateOne(filter, updatedDoc)
      res.send(result);
    })
    // Reviews
    app.get('/reviews', async (req, res) => {
        const result = await reviewCollection.find().toArray();
        res.send(result);
    })
    app.post('/reviews', verifytoken, async (req, res) =>{
      const item = req.body;
      const result = await reviewCollection.insertOne(item);
      res.send(result)
    })
    //bookings
    app.get('/bookings', async (req, res) => {
      const result = await bookingsCollection.find().toArray();
      res.send(result);
  })
    app.post('/bookings',verifytoken, async (req, res) =>{
      const bookings = req.body;
      const result = await bookingsCollection.insertOne(bookings);
      res.send(result)
    })

    app.get('/bookings/:email', verifytoken, async (req, res) => {
      const query = { email: req.params.email }
      if (req.params.email !== req.decoded.email) {
        return res.status(403).send({ message: 'forbidden access' });
      }
      const result = await bookingsCollection.find(query).toArray();
      res.send(result);
  })

    //cart collection
    app.get('/carts', async(req, res)=>{
        const email = req.query.email;
        const query = { email: email}
        const result = await cartCollection.find(query).toArray();
        res.send(result);
    })
    app.post('/carts', async(req, res)=>{
        const cartItem= req.body;
        const result = await cartCollection.insertOne(cartItem);
        res.send(result);
    })
    app.delete('/carts/:id', async(req, res)=>{
        const id = req.params.id;
        const query = {_id: new ObjectId(id)}
        const result = await cartCollection.deleteOne(query);
        res.send(result);

    })
    
    

    // payment
    app.post('/create-payment-intent', async(req, res)=>{
      const {price}  = req.body;
      const amount = parseInt(price *100);

      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: 'usd',
        payment_method_types: ['card']
      });
      res.send({
        clientSecret: paymentIntent.client_secret
      })

    })

    // payment releated api

    app.get('/payments/:email', verifytoken, async (req, res) => {
      const query = { email: req.params.email }
      if (req.params.email !== req.decoded.email) {
        return res.status(403).send({ message: 'forbidden access' });
      }
      const result = await paymentCollection.find(query).toArray();
      res.send(result);
    })

    app.post('/payments', async (req, res) => {
      const payment = req.body;
      const paymentResult = await paymentCollection.insertOne(payment);

      //  carefully delete each item from the cart
      console.log('payment info', payment);
      const query = {
        _id: {
          $in: payment.cartId.map(id => new ObjectId(id))
        }
      };

      const deleteResult = await cartCollection.deleteMany(query);
      // send user email notification payment
      // const data = {
      //   from: "Mailgun Sandbox <postmaster@sandbox578cd5d84d8c43f28a94e53eed0100f9.mailgun.org>",
      //   to: "roslinshuvo@gmail.com",
      //   subject: " Order confirmation",
      //   text: "Testing some Mailgun awesomness!",
      //   html: 
      //   `
      //   <h2>Thank you for your order with us.</h2>
      //   <h4>Transaction Id : <strong>${payment.transactionId}</strong></h4>
      //   <p>we would be pleased if you submit a rating testing the food </p>

      //   `
      // };
      // mg.messages().send(data, function (error, body) {
      //   console.log(body);
      // });
      // mg.messages.create(process.env.MAILGUN_SENDING_API, {
      //   from: "Mailgun Sandbox <postmaster@sandbox578cd5d84d8c43f28a94e53eed0100f9.mailgun.org>",
      //   to: ["roslinshuvo@gmail.com"],
      //   subject: "Order Confirmation",
      //   text: "Testing some Mailgun awesomeness!",
      //   html: 
      //     `
      //     <h2>Thank you for your order with us.</h2>
      //     <h4>Transaction Id : <strong>${payment.transactionId}</strong></h4>
      //     <p>we would be pleased if you submit a rating testing the food </p>
  
      //     `

      // })
      // .then(msg => console.log(msg)) // logs response data
      // .catch(err => console.log(err)); // logs any error

      mg.messages
        .create(process.env.MAIL_SENDING_DOMAIN, {
          from: "Mailgun Sandbox <postmaster@sandbox578cd5d84d8c43f28a94e53eed0100f9.mailgun.org>",
          to: ["roslinshuvo@gmail.com"],
          subject: "Bistro Boss Order Confirmation",
          text: "Testing some Mailgun awesomness!",
          html: `
            <div>
              <h2>Thank you for your order</h2>
              <h4>Your Transaction Id: <strong>${payment.transactionId}</strong></h4>
              <p>We would like to get your feedback about the food</p>
            </div>
          `
        })
        .then(msg => console.log(msg)) // logs response data
        .catch(err => console.log(err)); // logs any error`;

      res.send({ paymentResult, deleteResult });
    })

    app.get('/admin-stats', verifytoken, verifyAdmin, async (req, res) => {
      const users = await userCollection.estimatedDocumentCount();
      const menuItems = await menuCollection.estimatedDocumentCount();
      const orders = await paymentCollection.estimatedDocumentCount();

      // this is not the best way
      // const payments = await paymentCollection.find().toArray();
      // const revenue = payments.reduce((total, payment) => total + payment.price, 0);

      const result = await paymentCollection.aggregate([
        {
          $group: {
            _id: null,
            totalRevenue: {
              $sum: '$price'
            }
          }
        }
      ]).toArray();

      const revenue = result.length > 0 ? result[0].totalRevenue : 0;

      res.send({
        users,
        menuItems,
        orders,
        revenue
      })
    })

    //order status
    /**
     * ----------------
     * non efficient way
     * load all the payments
     * for every menuITEMS(which is an array) find from menu collection
     * for every item in the menu 
     */
    //using aggregate pipeline
  app.get('/order-stats', verifytoken, verifyAdmin, async(req, res)=>{
    const result = await paymentCollection.aggregate([
      {
        $unwind: '$menuItemId'
      },
      {
        $lookup: {
          from: 'menu',
          localField: 'menuItemId',
          foreignField: '_id',
          as: 'menuItems'
        }
      },
      {
        $unwind: '$menuItems'
      },
      {
        $group: {
          _id: '$menuItems.category',
          quantity: {$sum: 1},
          revenue:{$sum:'$menuItems.price'}
        }
      },
      {
        $project: {
          _id: 0,
          category: '$_id',
          quantity: '$quantity',
          revenue: '$revenue'
        }
      }
    ]).toArray();
    res.send(result);
  })
      

    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    // console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);


app.get('/', (req, res) =>{
    res.send('i am running') ;

})

app.listen(port, () =>{
    console.log(`my-food-boss is running on ${port}`);
});



