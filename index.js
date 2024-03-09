const express = require('express');
const app = express();
const cors = require('cors');
const port = process.env.PORT || 8000;
require('dotenv').config()
const jwt = require('jsonwebtoken');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);



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
    await client.connect();
    const userCollection = client.db("foodDb").collection("users");
    const menuCollection  = client.db("foodDb").collection("menu");
    const reviewCollection  = client.db("foodDb").collection("reviews");
    const cartCollection  = client.db("foodDb").collection("cart");
    const paymentCollection  = client.db("foodDb").collection("payments");

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

    app.get('/reviews', async (req, res) => {
        const result = await reviewCollection.find().toArray();
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

      res.send({ paymentResult, deleteResult });
    })
    

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
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



