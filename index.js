const express = require('express');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const cors = require('cors');
require('dotenv').config()
const cookieParser = require('cookie-parser');
const app = express();
const port = process.env.PROT || 3000


// middleware
app.use(cors());
app.use(express.json());
app.use(cookieParser())
console.log()


// mongodb
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.hpujglf.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

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


        const database = client.db('DevForumDB');
        // collection
        const postCollection = database.collection('devForum');
        const userCollection = database.collection('users');

        // user collection
        // get api (user email)
        app.get('/users/:email', async (req, res) => {
            try {
                const email = req.params.email;

                const user = await userCollection.findOne({ email });

                if (!user) {
                    return res.status(404).send({
                        success: false,
                        message: 'User not found',
                    });
                }

                res.send({
                    success: true,
                    user,
                });
            } catch (error) {
                console.error('Error fetching user:', error);
                res.status(500).send({
                    success: false,
                    message: 'Internal server error',
                    error: error.message,
                });
            }
        });
        // post api
        app.post('/users', async (req, res) => {
            const email = req.body.email;
            const userExists = await userCollection.findOne({ email });
            if (userExists) {
                return res.status(200).send({ message: 'user already exist', inserted: false });
            }
            const user = req.body;
            const result = await userCollection.insertOne(user);
            res.send(result)
        });


        // post collection
        // get all post api for email 
        app.get('/devForum/myPosts/:email', async (req, res) => {
            try {
                const email = req.params.email;

                const posts = await postCollection.find({ authorEmail: email }).toArray();

                res.send({
                    success: true,
                    count: posts.length,
                    posts,
                });
            } catch (error) {
                console.error('Error fetching posts:', error);
                res.status(500).send({
                    success: false,
                    message: 'Internal server error',
                    error: error.message,
                });
            }
        });
        // get all post api for id
        app.get('/devForum/:id', async (req, res) => {
            try {
                const id = req.params.id;

                // Invalid ObjectId handle
                if (!ObjectId.isValid(id)) {
                    return res.status(400).send({
                        success: false,
                        message: 'Invalid post ID',
                    });
                }

                const query = { _id: new ObjectId(id) };
                const result = await postCollection.findOne(query);

                if (!result) {
                    return res.status(404).send({
                        success: false,
                        message: 'Post not found',
                    });
                }

                res.send({
                    success: true,
                    post: result,
                });
            } catch (error) {
                console.error('Error fetching post by ID:', error);
                res.status(500).send({
                    success: false,
                    message: 'Internal server error',
                    error: error.message,
                });
            }
        });
        // get api for email (limit)
        app.get('/devForum/:email', async (req, res) => {
            try {
                const email = req.params.email;

                const posts = await postCollection.find({ authorEmail: email }).sort({ createdAt: -1 }).limit(3).toArray();

                res.send({
                    success: true,
                    count: posts.length,
                    posts,
                });
            } catch (error) {
                console.error('Error fetching posts:', error);
                res.status(500).send({
                    success: false,
                    message: 'Internal server error',
                    error: error.message,
                });
            }
        });
        //  Count API: Get post count by user email
        app.get('/devForum/count', async (req, res) => {
            try {
                const email = req.query.email;
                if (!email) {
                    return res.status(400).send({ message: 'Email is required' });
                }

                const count = await postCollection.countDocuments({ authorEmail: email });
                res.send({ count });
            } catch (error) {
                console.error('Error fetching post count:', error);
                res.status(500).send({ error: 'Internal Server Error' });
            }
        });
        // post API
        app.post('/devForum', async (req, res) => {
            try {
                const newPost = req.body;

                // add default values if not provided
                newPost.upVote = 0;
                newPost.downVote = 0;
                newPost.createdAt = new Date();

                const result = await postCollection.insertOne(newPost);
                res.status(201).send({
                    success: true,
                    message: 'Post added successfully',
                    insertedId: result.insertedId,
                });
            } catch (error) {
                console.error('Error inserting post:', error);
                res.status(500).send({
                    success: false,
                    message: 'Failed to add post',
                    error: error.message,
                });
            }
        });
        // delete all post api for id
        app.delete('/devForum/:id', async (req, res) => {
            try {
                const id = req.params.id;

                
                if (!ObjectId.isValid(id)) {
                    return res.status(400).send({
                        success: false,
                        message: 'Invalid post ID',
                    });
                }

                const query = { _id: new ObjectId(id) };
                const result = await postCollection.deleteOne(query);

                if (result.deletedCount === 0) {
                    return res.status(404).send({
                        success: false,
                        message: 'No post found to delete',
                    });
                }

                res.send({
                    success: true,
                    message: 'Post deleted successfully',
                    deletedId: id,
                });
            } catch (error) {
                console.error('Error deleting post:', error);
                res.status(500).send({
                    success: false,
                    message: 'Internal server error',
                    error: error.message,
                });
            }
        });





        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);















app.get('/', (req, res) => {
    res.send('Hello World')
})

app.listen(port, () => {
    console.log(`app listening on port: ${port}`)
})