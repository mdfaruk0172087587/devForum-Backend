const express = require('express');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const cors = require('cors');
require('dotenv').config()
const cookieParser = require('cookie-parser');
const app = express();
const port = process.env.PROT || 3000

const stripe = require('stripe')(process.env.PAYMENT_KEY); // Use your Stripe secret key


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
        const commentCollection = database.collection('comments');
        const commentReplayCollection = database.collection('commentsReplay');
        const paymentCollection = database.collection('payments');
        const announcementCollection = database.collection('announcements');
        const tagsCollection = database.collection('tags');

        // user collection
        // get api (user email for role (admin dash))
        app.get('/users/role', async (req, res) => {
            try {
                const email = req.query.email;

                if (!email) {
                    return res.status(400).send({
                        success: false,
                        message: 'Email is required',
                    });
                }

                // userCollection থেকে role খোঁজা
                const user = await userCollection.findOne(
                    { email },
                    {
                        projection: { role: 1, _id: 0 }
                    }
                );

                if (!user) {
                    return res.status(404).send({
                        success: false,
                        message: 'User not found',
                    });
                }

                res.send({
                    success: true,
                    email,
                    role: user.role,
                });

            } catch (error) {
                console.error('Error fetching user role:', error);
                res.status(500).send({
                    success: false,
                    message: 'Internal Server Error',
                    error: error.message,
                });
            }
        });
        // get api (user name (admin 2))
        app.get('/users/search', async (req, res) => {
            try {
                const name = req.query.name;

                if (!name) {
                    return res.status(400).send({
                        success: false,
                        message: 'Name is required',
                    });
                }

                // partial and case-insensitive match
                const query = {
                    name: { $regex: name, $options: 'i' } // i = case-insensitive
                };

                const users = await userCollection.find(query).toArray();

                res.send({
                    success: true,
                    count: users.length,
                    users
                });

            } catch (error) {
                console.error('Error searching users:', error);
                res.status(500).send({
                    success: false,
                    message: 'Internal Server Error',
                    error: error.message,
                });
            }
        });
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
        // update admin
        app.put('/users/admin/:id', async (req, res) => {
            try {
                const id = req.params.id;

                if (!id) {
                    return res.status(400).send({
                        success: false,
                        message: 'User ID is required',
                    });
                }

                const query = { _id: new ObjectId(id) };

                //  Step 1: user kho ja
                const user = await userCollection.findOne(query);

                if (!user) {
                    return res.status(404).send({
                        success: false,
                        message: 'User not found',
                    });
                }

                if (user.role === 'admin') {
                    return res.status(400).send({
                        success: false,
                        message: 'User is already an admin',
                    });
                }

                // 🛠️ Step 2: age r role save ko re admin ko ra
                const updateDoc = {
                    $set: {
                        role: 'admin',
                        previousRole: user.role || 'user'
                    }
                };

                const result = await userCollection.updateOne(query, updateDoc);

                res.send({
                    success: true,
                    message: `User promoted to admin (previous role was ${user.role})`,
                    modifiedCount: result.modifiedCount,
                });

            } catch (error) {
                console.error('Error updating user to admin:', error);
                res.status(500).send({
                    success: false,
                    message: 'Internal Server Error',
                    error: error.message,
                });
            }
        });
        // update remove admin
        app.put('/users/removeAdmin/:id', async (req, res) => {
            try {
                const id = req.params.id;

                if (!id) {
                    return res.status(400).send({
                        success: false,
                        message: 'User ID is required',
                    });
                }

                const query = { _id: new ObjectId(id) };

                // age r user an a
                const user = await userCollection.findOne(query);

                if (!user) {
                    return res.status(404).send({
                        success: false,
                        message: 'User not found',
                    });
                }

                if (user.role !== 'admin') {
                    return res.status(400).send({
                        success: false,
                        message: 'User is not an admin',
                    });
                }

                const previousRole = user.previousRole || 'user';

                const updateDoc = {
                    $set: {
                        role: previousRole
                    },
                    $unset: {
                        previousRole: ""
                    }
                };

                const result = await userCollection.updateOne(query, updateDoc);

                if (result.modifiedCount === 0) {
                    return res.status(500).send({
                        success: false,
                        message: 'Failed to remove admin role',
                    });
                }

                res.send({
                    success: true,
                    message: `User demoted from admin to ${previousRole}`,
                    modifiedCount: result.modifiedCount,
                });

            } catch (error) {
                console.error('Error removing admin role:', error);
                res.status(500).send({
                    success: false,
                    message: 'Internal Server Error',
                    error: error.message,
                });
            }
        });





        // post collection
        // get all post
        app.get('/devForum', async (req, res) => {
            try {
                // Query parameters
                const page = parseInt(req.query.page) || 1;
                const limit = parseInt(req.query.limit) || 5;
                const skip = (page - 1) * limit;

                // Total posts count (for frontend pagination)
                const totalPosts = await postCollection.countDocuments();

                // Paginated posts
                const result = await postCollection
                    .find()
                    .sort({ createdAt: -1 })
                    .skip(skip)
                    .limit(limit)
                    .toArray();

                res.send({
                    success: true,
                    currentPage: page,
                    totalPosts,
                    totalPages: Math.ceil(totalPosts / limit),
                    count: result.length,
                    posts: result
                });
            } catch (error) {
                console.error('Error fetching paginated posts:', error);
                res.status(500).send({
                    success: false,
                    message: 'Failed to load posts',
                    error: error.message
                });
            }
        });
        // Get posts sorted by popularity
        app.get('/devForum/popular', async (req, res) => {
            try {
                const page = parseInt(req.query.page) || 1;
                const limit = parseInt(req.query.limit) || 5;
                const skip = (page - 1) * limit;

                const totalPosts = await postCollection.countDocuments();

                const result = await postCollection.aggregate([
                    {
                        $addFields: {
                            voteDifference: { $subtract: ["$upVote", "$downVote"] }
                        }
                    },
                    {
                        $sort: { voteDifference: -1, createdAt: -1 }
                    },
                    { $skip: skip },
                    { $limit: limit }
                ]).toArray();

                res.send({
                    success: true,
                    currentPage: page,
                    totalPosts,
                    totalPages: Math.ceil(totalPosts / limit),
                    count: result.length,
                    posts: result
                });
            } catch (error) {
                console.error('Error sorting posts by popularity:', error);
                res.status(500).send({
                    success: false,
                    message: 'Failed to sort posts',
                    error: error.message
                });
            }
        });
        // get all post api for email( my post)
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

        // get api for email (limit 3) (my profile)
        app.get('/devForum/myProfile/:email', async (req, res) => {
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
        //  Count API: Get post count by user email (add post)
        app.get('/devForum/count', async (req, res) => {
            try {
                const email = req.query.email;
                if (!email) {
                    return res.status(400).send({ message: 'Email is required' });
                }

                const count = await postCollection.countDocuments({ authorEmail: email });
                const user = await userCollection.findOne({ email });
                const isMember = user?.role === 'member';
                const canPost = isMember || count <= 5;

                res.send({ count, role: user?.role });
            } catch (error) {
                console.error('Error fetching post count:', error);
                res.status(500).send({ error: 'Internal Server Error' });
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
        // update upVote
        app.patch('/devForum/upvote/:id', async (req, res) => {
            try {
                const id = req.params.id;

                // validate id
                if (!ObjectId.isValid(id)) {
                    return res.status(400).send({
                        success: false,
                        message: 'Invalid post ID',
                    });
                }

                const filter = { _id: new ObjectId(id) };
                const updateDoc = {
                    $inc: { upVote: 1 },
                };

                const result = await postCollection.updateOne(filter, updateDoc);

                if (result.modifiedCount === 0) {
                    return res.status(404).send({
                        success: false,
                        message: 'Post not found or already updated',
                    });
                }

                res.send({
                    success: true,
                    message: 'Upvote added successfully',
                    updatedId: id,
                });
            } catch (error) {
                console.error('Error adding upvote:', error);
                res.status(500).send({
                    success: false,
                    message: 'Failed to upvote',
                    error: error.message,
                });
            }
        });
        // update downvote
        app.patch('/devForum/downvote/:id', async (req, res) => {
            try {
                const id = req.params.id;

                // Validate MongoDB ObjectId
                if (!ObjectId.isValid(id)) {
                    return res.status(400).send({
                        success: false,
                        message: 'Invalid post ID',
                    });
                }

                const result = await postCollection.updateOne(
                    { _id: new ObjectId(id) },
                    { $inc: { downVote: 1 } }
                );

                if (result.modifiedCount === 0) {
                    return res.status(404).send({
                        success: false,
                        message: 'Post not found or already downvoted',
                    });
                }

                res.send({
                    success: true,
                    message: 'Downvote added successfully',
                    updatedId: id,
                });
            } catch (error) {
                console.error('Error adding downvote:', error);
                res.status(500).send({
                    success: false,
                    message: 'Failed to downvote',
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


        // comment collection
        // get for post id
        app.get('/comments/:postId', async (req, res) => {
            try {
                const postId = req.params.postId;

                // যদি postId MongoDB ObjectId হিসেবে স্টোর হয়ে থাকে
                const query = { postId: postId };

                const comments = await commentCollection
                    .find(query)
                    .sort({ createdAt: -1 }) // নতুন কমেন্ট আগে দেখাতে চাইলে
                    .toArray();

                res.send({
                    success: true,
                    count: comments.length,
                    comments,
                });
            } catch (error) {
                console.error('Error fetching comments:', error);
                res.status(500).send({
                    success: false,
                    message: 'Failed to load comments',
                    error: error.message,
                });
            }
        });
        // post
        app.post('/comments', async (req, res) => {
            try {
                const newComment = req.body;

                // Optional validation
                if (!newComment.postId || !newComment.commenterEmail || !newComment.commentText) {
                    return res.status(400).send({
                        success: false,
                        message: 'Missing required fields (postId, author, text)',
                    });
                }


                newComment.createdAt = new Date().toISOString();

                const result = await commentCollection.insertOne(newComment);

                res.status(201).send({
                    success: true,
                    message: 'Comment added successfully',
                    insertedId: result.insertedId,
                });
            } catch (error) {
                console.error('Error adding comment:', error);
                res.status(500).send({
                    success: false,
                    message: 'Failed to add comment',
                    error: error.message,
                });
            }
        });
        // update get for id(my post comment Feedback)
        app.put('/comments/:id', async (req, res) => {
            try {
                const id = req.params.id;

                // Validate ID
                if (!ObjectId.isValid(id)) {
                    return res.status(400).send({
                        success: false,
                        message: 'Invalid comment ID',
                    });
                }

                const query = { _id: new ObjectId(id) };
                const updateDoc = {
                    $set: {
                        status: true,
                    }
                };

                const result = await commentCollection.updateOne(query, updateDoc);

                if (result.modifiedCount === 0) {
                    return res.status(404).send({
                        success: false,
                        message: 'Comment not found or already updated',
                    });
                }

                res.send({
                    success: true,
                    message: 'Comment updated successfully',
                    updatedId: id,
                });
            } catch (error) {
                console.error('Error updating comment:', error);
                res.status(500).send({
                    success: false,
                    message: 'Failed to update comment',
                    error: error.message,
                });
            }
        });

        // comments replay collection
        // post
        app.post('/commentsReplay', async (req, res) => {
            try {
                const newReplay = req.body;

                // Validation
                if (!newReplay.commentId || !newReplay.reportedEmail || !newReplay.feedback) {
                    return res.status(400).send({
                        success: false,
                        message: 'Missing required fields (commentId, reportedEmail, feedback)',
                    });
                }

                // Check if already reported by same user
                const alreadyReported = await commentReplayCollection.findOne({
                    commentId: newReplay.commentId,
                    reportedEmail: newReplay.reportedEmail,
                });

                if (alreadyReported) {
                    return res.status(409).send({
                        success: false,
                        message: 'You have already reported this comment.',
                    });
                }

                // Insert into DB
                const result = await commentReplayCollection.insertOne(newReplay);

                res.status(201).send({
                    success: true,
                    message: 'Reported successfully.',
                    insertedId: result.insertedId,
                });

            } catch (error) {
                console.error('Error inserting report:', error);
                res.status(500).send({
                    success: false,
                    message: 'Failed to add report',
                    error: error.message,
                });
            }
        });

        // announcementCollection
        // post api
        app.post('/announcements', async (req, res) => {
            try {
                const newAnnouncement = req.body;

                //  Validation check
                if (!newAnnouncement?.title || !newAnnouncement?.description) {
                    return res.status(400).send({
                        success: false,
                        message: 'Title and message are required',
                    });
                }

                //  Optional: createdAt
                newAnnouncement.createdAt = new Date();

                const result = await announcementCollection.insertOne(newAnnouncement);

                res.status(201).send({
                    success: true,
                    message: 'Announcement posted successfully',
                    insertedId: result.insertedId,
                });
            } catch (error) {
                console.error('Error posting announcement:', error);
                res.status(500).send({
                    success: false,
                    message: 'Internal Server Error',
                    error: error.message,
                });
            }
        });




        // payment collection
        // payments post 
        app.post('/payments', async (req, res) => {
            try {
                const { email, amount, paymentMethod, transactionId } = req.body;


                // update users status
                const updateResult = await userCollection.updateOne(
                    { email: email },
                    {
                        $set: {
                            role: 'member'
                        }
                    }
                );

                // 2. insert payment record
                const paymentDoc = {
                    email,
                    amount,
                    paymentMethod,
                    transactionId,
                    paid_at_string: new Date().toISOString(),
                    paid_at: new Date(),
                };
                const paymentResult = await paymentCollection.insertOne(paymentDoc);
                res.status(201).send({
                    message: 'payment recorded and parcel marked as paid',
                    insertedId: paymentResult.insertedId
                })
            }
            catch (error) {
                console.log('payment processing failed :', error);
                res.status(500).send({ message: 'failed to record payment' })
            }
        })

        // payment api 
        app.post('/create-payment-intent', async (req, res) => {
            const amountInCents = req.body.amountInCents;
            try {
                const paymentIntent = await stripe.paymentIntents.create({
                    amount: amountInCents, // Amount in cents
                    currency: 'usd',
                    payment_method_types: ['card'],
                });

                res.json({ clientSecret: paymentIntent.client_secret });
            } catch (error) {
                res.status(500).json({ error: error.message });
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