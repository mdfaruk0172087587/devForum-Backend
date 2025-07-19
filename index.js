const express = require('express');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const cors = require('cors');
const jwt = require('jsonwebtoken')
require('dotenv').config()
const cookieParser = require('cookie-parser');
const app = express();
const port = process.env.PROT || 3000

const stripe = require('stripe')(process.env.PAYMENT_KEY); // Use your Stripe secret key


// middleware
app.use(cors({
    origin: ['http://localhost:5173', 'https://magnificent-kulfi-510251.netlify.app'],
    credentials: true
}));
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
        // await client.connect();


        const database = client.db('DevForumDB');
        // collection
        const postCollection = database.collection('devForum');
        const userCollection = database.collection('users');
        const commentCollection = database.collection('comments');
        const commentReplayCollection = database.collection('commentsReplay');
        const paymentCollection = database.collection('payments');
        const announcementCollection = database.collection('announcements');
        const tagsCollection = database.collection('tags');

        // custom middleware
        const verifyToken = (req, res, next) => {
            const token = req?.cookies?.token;
            if (!token) {
                return res.status(401).send({ message: 'unauthorized access' })
            }
            //    verify token
            jwt.verify(token, process.env.JWT_ACCESS_SECRET, (err, decoded) => {
                if (err) {
                    return res.status(401).send({ message: 'unauthorized access' })
                }
                req.decoded = decoded;
                next();
            })

        };

        const verifyTokenEmail = (req, res, next) => {
            console.log(req.params.email, req.decoded.email)
            if (req.params.email !== req.decoded.email) {
                return res.status(403).send({ message: 'forbidden access' })
            }
            next()
        };

        const verifyAdmin = async (req, res, next) => {
            const email = req.decoded.email;
            console.log()
            const query = { email };
            const user = await userCollection.findOne(query);
            if (!user || user.role !== 'admin') {
                return res.status(403).send({ message: 'forbidden access' })
            }
            next()
        }

        // jwt apis
        app.post('/jwt', async (req, res) => {
            const { email } = req.body;
            const user = { email };
            const token = jwt.sign(user, process.env.JWT_ACCESS_SECRET, { expiresIn: '1days' });
            // set token
            res.cookie('token', token, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
            })
            res.send({ success: true })
        });
        // jwt logout
        app.post('/logout', async (req, res) => {
            console.log(req.headers.cookie)
            res.clearCookie('token', {
                httpOnly: true,
               secure: process.env.NODE_ENV === 'production',
                sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
            }).send({ status: true, message: 'Logged out successfully' });
        });


        // user collection
        // get all users
        app.get('/users', verifyToken, verifyAdmin, async (req, res) => {
            try {
                const users = await userCollection
                    .find()
                    .toArray();

                res.send({
                    success: true,
                    count: users.length,
                    users: users,
                });
            } catch (error) {
                console.error('Error fetching users:', error);
                res.status(500).send({
                    success: false,
                    message: 'Failed to fetch users',
                    error: error.message,
                });
            }
        });

        // get api (user email for role (admin dash))
        app.get('/users/role', verifyToken, async (req, res) => {
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
        // get api (user name (manage users))
        app.get('/users/manage/:email/search', verifyToken, verifyTokenEmail, verifyAdmin, async (req, res) => {
            const name = req.query.name || '';
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 10;
            const skip = (page - 1) * limit;

            const query = { name: { $regex: name, $options: 'i' } };
            const users = await userCollection.find(query).skip(skip).limit(limit).toArray();
            const totalUsers = await userCollection.countDocuments(query);

            res.send({
                success: true,
                users,
                totalPages: Math.ceil(totalUsers / limit),
                currentPage: page
            });
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
        app.put('/users/admin/:id', verifyToken, verifyAdmin, async (req, res) => {
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
        app.put('/users/removeAdmin/:id', verifyToken, verifyAdmin, async (req, res) => {
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
                const page = parseInt(req.query.page) || 1;
                const limit = parseInt(req.query.limit) || 5;
                const skip = (page - 1) * limit;

                const tag = req.query.tag;

                // Filter condition based on tag
                const query = tag ? { tag: { $regex: new RegExp(tag, 'i') } } : {};

                // Count filtered posts
                const totalPosts = await postCollection.countDocuments(query);

                // Get paginated + filtered posts
                const result = await postCollection
                    .find(query)
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
        app.get('/devForum/myPosts/:email', verifyToken, verifyTokenEmail, async (req, res) => {
            const email = req.params.email;
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 10;
            const skip = (page - 1) * limit;

            const totalPosts = await postCollection.countDocuments({ authorEmail: email });

            const posts = await postCollection
                .find({ authorEmail: email })
                .skip(skip)
                .limit(limit)
                .toArray();

            res.send({
                success: true,
                posts,
                totalPosts,
                totalPages: Math.ceil(totalPosts / limit),
                currentPage: page
            });
        });


        // get api for email (limit 3) (my profile)
        app.get('/devForum/myProfile/:email', verifyToken, verifyTokenEmail, async (req, res) => {
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
        app.get('/devForum/:email/count', verifyToken, verifyTokenEmail, async (req, res) => {
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
        app.post('/devForum', verifyToken, async (req, res) => {
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
        app.delete('/devForum/:email/:id', verifyToken, verifyTokenEmail, async (req, res) => {
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
        // get all comments
        app.get('/comments', verifyToken, verifyAdmin, async (req, res) => {
            try {
                const result = await commentCollection
                    .find()
                    .sort({ createdAt: -1 })
                    .toArray();

                res.send({
                    success: true,
                    count: result.length,
                    comments: result,
                });
            } catch (error) {
                console.error('Error fetching comments:', error);
                res.status(500).send({
                    success: false,
                    message: 'Failed to fetch comments',
                    error: error.message,
                });
            }
        });
        // get for post id
        app.get('/comments/:postId', async (req, res) => {
            try {
                const postId = req.params.postId;

                const page = parseInt(req.query.page) || 1;
                const limit = parseInt(req.query.limit) || 10;
                const skip = (page - 1) * limit;

                const query = { postId: postId };

                const comments = await commentCollection
                    .find(query)
                    .sort({ createdAt: -1 })
                    .skip(skip)
                    .limit(limit)
                    .toArray();

                const totalComments = await commentCollection.countDocuments(query);

                res.send({
                    success: true,
                    currentPage: page,
                    totalPages: Math.ceil(totalComments / limit),
                    count: comments.length,
                    totalComments,
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
        app.post('/comments', verifyToken, async (req, res) => {
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
        // update comment
        app.put('/comments/:email/:id', verifyToken, verifyTokenEmail, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const updateDoc = {
                $set: {
                    status: true
                }
            }
            const result = await commentCollection.updateOne(query, updateDoc);
            res.send(result)
        })
        // delete comment(id)
        app.delete('/comments/:id', verifyToken, verifyAdmin, async (req, res) => {
            try {
                const id = req.params.id;

                if (!id) {
                    return res.status(400).send({
                        success: false,
                        message: 'Comment ID is required',
                    });
                }

                const query = { _id: new ObjectId(id) };
                const result = await commentCollection.deleteOne(query);

                if (result.deletedCount === 0) {
                    return res.status(404).send({
                        success: false,
                        message: 'Comment not found or already deleted',
                    });
                }

                res.send({
                    success: true,
                    message: 'Comment deleted successfully',
                    deletedCount: result.deletedCount,
                });
            } catch (error) {
                console.error('Error deleting comment:', error);
                res.status(500).send({
                    success: false,
                    message: 'Internal Server Error',
                    error: error.message,
                });
            }
        });


        // comments replay collection
        // get all replay
        app.get('/commentsReplay', async (req, res) => {
            try {
                const page = parseInt(req.query.page) || 1;
                const limit = parseInt(req.query.limit) || 10;
                const skip = (page - 1) * limit;
                const query = {};
                const total = await commentReplayCollection.countDocuments(query);

                const replays = await commentReplayCollection
                    .find(query)
                    .skip(skip)
                    .limit(limit)
                    .sort({ createdAt: -1 })
                    .toArray();

                res.send({
                    success: true,
                    replays,
                    currentPage: page,
                    totalPages: Math.ceil(total / limit)
                });
            } catch (error) {
                console.error('Error fetching replays:', error);
                res.status(500).send({
                    success: false,
                    message: 'Failed to load replays',
                    error: error.message
                });
            }
        });


        // post
        app.post('/commentsReplay', verifyToken, async (req, res) => {
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
        // delete id
        app.delete('/commentsReplay/:id', verifyToken, verifyAdmin, async (req, res) => {
            try {
                const id = req.params.id;

                if (!id) {
                    return res.status(400).send({
                        success: false,
                        message: 'Replay ID is required',
                    });
                }

                const query = { _id: new ObjectId(id) };
                const result = await commentReplayCollection.deleteOne(query);

                if (result.deletedCount === 0) {
                    return res.status(404).send({
                        success: false,
                        message: 'Replay not found or already deleted',
                    });
                }

                res.send({
                    success: true,
                    message: 'Replay deleted successfully',
                    deletedCount: result.deletedCount,
                });

            } catch (error) {
                console.error('Error deleting replay:', error);
                res.status(500).send({
                    success: false,
                    message: 'Internal server error',
                    error: error.message,
                });
            }
        });


        // announcementCollection
        // get api(all post)
        app.get('/announcements', async (req, res) => {
            try {
                const result = await announcementCollection
                    .find()
                    .sort({ createdAt: -1 })
                    .toArray();

                res.send({
                    success: true,
                    count: result.length,
                    announcements: result,
                });

            } catch (error) {
                console.error('Error fetching announcements:', error);
                res.status(500).send({
                    success: false,
                    message: 'Failed to fetch announcements',
                    error: error.message,
                });
            }
        });
        // post api
        app.post('/announcements', verifyToken, verifyAdmin, async (req, res) => {
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
        // payment  api 
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
        // tagsCollection
        // get api 
        app.get('/tags', async (req, res) => {
            try {
                const tags = await tagsCollection
                    .find()
                    .toArray();

                res.send({
                    success: true,
                    count: tags.length,
                    tags: tags,
                });
            } catch (error) {
                console.error('Error fetching tags:', error);
                res.status(500).send({
                    success: false,
                    message: 'Failed to fetch tags',
                    error: error.message,
                });
            }
        });

        // post api
        app.post('/tags', verifyToken, verifyAdmin, async (req, res) => {
            try {
                const newTag = req.body;

                // Check if 'tag' field exists
                if (!newTag?.tag) {
                    return res.status(400).send({
                        success: false,
                        message: 'Tag field is required',
                    });
                }

                // Check if same tag already exists (case-insensitive)
                const existingTag = await tagsCollection.findOne({
                    tag: { $regex: `^${newTag.tag}$`, $options: 'i' },
                });

                if (existingTag) {
                    return res.status(409).send({
                        success: false,
                        message: 'This tag already exists',
                    });
                }

                // Insert new tag
                const result = await tagsCollection.insertOne(newTag);

                res.send({
                    success: true,
                    message: 'Tag added successfully',
                    insertedId: result.insertedId,
                });

            } catch (error) {
                console.error('Error adding tag:', error);
                res.status(500).send({
                    success: false,
                    message: 'Internal Server Error',
                    error: error.message,
                });
            }
        });







        // Send a ping to confirm a successful connection
        // await client.db("admin").command({ ping: 1 });
        // console.log("Pinged your deployment. You successfully connected to MongoDB!");
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