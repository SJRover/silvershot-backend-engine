const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(cors());

// PASTE THE UPDATED ALPHANUMERIC PASSWORD DIRECTLY INSIDE THE STRING CONTAINER BELOW:
const MONGO_URI = "mongodb+srv://silvershot_dev:SilverShotNet2026@silvershotcluster.wexyaxl.mongodb.net/silvershot_db?retryWrites=true&w=majority";

mongoose.connect(MONGO_URI)
  .then(() => console.log('Database verification loop established.'))
  .catch(err => console.error('Database connection error logged:', err));

// --- DATA COLLECTION SCHEMAS ---

const UserSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true, lowercase: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    passwordHash: { type: String, required: true },
    fullName: { type: String, default: 'Anonymous Creator' },
    bio: { type: String, default: 'Executing network modules inside cloud spaces.' },
    age: { type: Number, default: 24 },
    status: { type: String, default: 'Single' },
    country: { type: String, default: 'United Kingdom' },
    avatarString: { type: String, default: null },
    hallOfFame: { type: Array, default: [] },
    followers: { type: [String], default: [] },
    following: { type: [String], default: [] },
    followRequests: { type: [String], default: [] },
    isPrivate: { type: Boolean, default: false },
    hideFollowersList: { type: Boolean, default: false },
    allowMessagesFrom: { type: String, enum: ['everyone', 'following', 'none'], default: 'everyone' }
});
const User = mongoose.model('User', UserSchema);

const ActivePostSchema = new mongoose.Schema({
    username: { type: String, required: true },
    fullName: { type: String, required: true },
    initial: { type: String, required: true },
    avatarImg: { type: String, default: null },
    img: { type: String, required: true },
    category: { type: String, required: true },
    caption: { type: String, required: true },
    hashtags: { type: [String], default: [] }, // Indexed data array for search algorithm performance
    likes: { type: Number, default: 0 },
    medals: { type: Number, default: 0 },
    broccolis: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now },
    userInteractors: { type: [String], default: [] }
});
const ActivePost = mongoose.model('ActivePost', ActivePostSchema);

const DirectMessageSchema = new mongoose.Schema({
    sender: { type: String, required: true },
    receiver: { type: String, required: true },
    text: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
    isAccepted: { type: Boolean, default: false }
});
const DirectMessage = mongoose.model('DirectMessage', DirectMessageSchema);

// --- WEIGHTED SEARCH ALGORITHM ENDPOINT ---

app.get('/api/search', async (req, res) => {
    try {
        const rawQuery = req.query.q ? req.query.q.trim().toLowerCase() : '';
        if (!rawQuery) {
            return res.json({ users: [], posts: [] });
        }

        // Clean target string to isolate standalone search terms or hashtags
        const cleanedQuery = rawQuery.replace('#', '');

        // 1. Scan Profile Records and Calculate Relevance Metrics
        const globalUsersList = await User.find({});
        const categorizedUsers = globalUsersList.map(profile => {
            let relevanceRank = 0;
            
            if (profile.username === cleanedQuery) {
                relevanceRank += 100; // Exact account handle matching priority
            } else if (profile.username.includes(cleanedQuery)) {
                relevanceRank += 50;  // Substring alignment priority
            }
            
            if (profile.fullName.toLowerCase().includes(cleanedQuery)) {
                relevanceRank += 30;  // Real name string intersection priority
            }

            return { profile, relevanceRank };
        })
        .filter(node => node.relevanceRank > 0)
        .sort((alpha, beta) => beta.relevanceRank - alpha.relevanceRank)
        .map(node => ({
            username: node.profile.username,
            fullName: node.profile.fullName,
            avatarString: node.profile.avatarString,
            followersCount: node.profile.followers.length,
            isPrivate: node.profile.isPrivate
        }));

        // 2. Scan Post Streams and Rank via Tag Weighting Mappings
        const globalPostsList = await ActivePost.find({});
        const categorizedPosts = globalPostsList.map(post => {
            let relevanceRank = 0;

            if (post.hashtags && post.hashtags.includes(cleanedQuery)) {
                relevanceRank += 80;  // Explicit hashtag index intersection bonus
            }
            if (post.caption.toLowerCase().includes(cleanedQuery)) {
                relevanceRank += 40;  // Text block keyword correlation value
            }
            if (post.username === cleanedQuery) {
                relevanceRank += 20;  // Author handle intersection value
            }

            return { post, relevanceRank };
        })
        .filter(node => node.relevanceRank > 0)
        .sort((alpha, beta) => beta.relevanceRank - alpha.relevanceRank)
        .map(node => node.post);

        res.json({ users: categorizedUsers, posts: categorizedPosts });
    } catch (err) {
        res.status(500).json({ error: 'Search infrastructure computation failure.' });
    }
});

// --- STANDARD USER ACCOUNT CONTROL AND TIMELINE ROUTES ---

app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, email, password } = req.body;
        const normalizedHandle = username.trim().toLowerCase();

        const handleMatch = await User.findOne({ username: normalizedHandle });
        if (handleMatch) return res.status(400).json({ error: 'Conflict Protocol: Username already allocated.' });

        const emailMatch = await User.findOne({ email: email.toLowerCase() });
        if (emailMatch) return res.status(400).json({ error: 'Conflict Protocol: Email linked to existing node.' });

        const salt = await bcrypt.genSalt(10);
        const hashed = await bcrypt.hash(password, salt);

        const newAccount = new User({
            username: normalizedHandle,
            email: email.toLowerCase(),
            passwordHash: hashed,
            fullName: username + " Persona"
        });

        await newAccount.save();
        res.json({ message: 'Account instantiation parameter completed successfully.' });
    } catch (err) {
        res.status(500).json({ error: 'Server processing failure.' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { loginInput, password } = req.body;
        const queryStr = loginInput.trim().toLowerCase();

        let accountMatch = await User.findOne({ username: queryStr }) || await User.findOne({ email: queryStr });
        if (!accountMatch) return res.status(400).json({ error: 'Security Warning: Identity configuration unresolved.' });

        const checkPass = await bcrypt.compare(password, accountMatch.passwordHash);
        if (!checkPass) return res.status(400).json({ error: 'Security Warning: Credential matching criteria failed.' });

        const activeUpload = await ActivePost.findOne({ username: accountMatch.username });

        res.json({
            username: accountMatch.username,
            fullName: accountMatch.fullName,
            bio: accountMatch.bio,
            age: accountMatch.age,
            status: accountMatch.status,
            country: accountMatch.country,
            avatarString: accountMatch.avatarString,
            hallOfFame: accountMatch.hallOfFame,
            followers: accountMatch.followers,
            following: accountMatch.following,
            followRequests: accountMatch.followRequests,
            isPrivate: accountMatch.isPrivate,
            hideFollowersList: accountMatch.hideFollowersList,
            allowMessagesFrom: accountMatch.allowMessagesFrom,
            activePost: activeUpload
        });
    } catch (err) {
        res.status(500).json({ error: 'Server validation loop error.' });
    }
});

app.put('/api/profile/update', async (req, res) => {
    try {
        const { username, fullName, bio, age, status, country, avatarString, isPrivate, hideFollowersList, allowMessagesFrom } = req.body;
        
        const profile = await User.findOneAndUpdate(
            { username: username.toLowerCase() },
            { fullName, bio, age, status, country, avatarString, isPrivate, hideFollowersList, allowMessagesFrom },
            { new: true }
        );
        
        if (!profile) return res.status(404).json({ error: 'Profile metadata unresolved.' });
        await ActivePost.updateMany({ username: profile.username }, { fullName: profile.fullName, avatarImg: profile.avatarString });
        
        res.json({ message: 'Profile variables saved.', user: profile });
    } catch (err) {
        res.status(500).json({ error: 'Failed to save updated profile variables.' });
    }
});

app.post('/api/posts/upload', async (req, res) => {
    try {
        const { username, img, category, caption, hashtags } = req.body;

        const profile = await User.findOne({ username });
        if (!profile) return res.status(404).json({ error: 'Profile verification reference empty.' });

        await ActivePost.deleteMany({ username });

        const postEntry = new ActivePost({
            username,
            fullName: profile.fullName,
            initial: username.charAt(0).toUpperCase(),
            avatarImg: profile.avatarString,
            img,
            category,
            caption,
            hashtags: hashtags || [] // Save clean array metadata strings standardly
        });

        await postEntry.save();
        res.json({ message: 'Asset loaded onto live timeline successfully.', activePost: postEntry });
    } catch (err) {
        res.status(500).json({ error: 'Data pipeline commit failure.' });
    }
});

app.post('/api/relations/follow', async (req, res) => {
    try {
        const { sender, target } = req.body;
        const actor = await User.findOne({ username: sender.toLowerCase() });
        const recipient = await User.findOne({ username: target.toLowerCase() });

        if (!actor || !recipient) return res.status(404).json({ error: 'User nodes unverified.' });
        if (actor.following.includes(recipient.username)) return res.status(400).json({ error: 'Connection already exists.' });

        if (recipient.isPrivate) {
            if (!recipient.followRequests.includes(actor.username)) {
                recipient.followRequests.push(actor.username);
                await recipient.save();
            }
            return res.json({ status: 'requested', message: 'Follow transaction stored in verification queue.' });
        } else {
            recipient.followers.push(actor.username);
            actor.following.push(recipient.username);
            await recipient.save();
            await actor.save();
            return res.json({ status: 'following', message: 'Connection established standardly.' });
        }
    } catch (err) {
        res.status(500).json({ error: 'Relationship processing system error.' });
    }
});

app.get('/api/feed/:username', async (req, res) => {
    try {
        const user = await User.findOne({ username: req.params.username.toLowerCase() });
        if (!user) return res.status(404).json({ error: 'User workspace unverified.' });

        const posts = await ActivePost.find({});
        const filteredPosts = [];

        for (let post of posts) {
            const author = await User.findOne({ username: post.username });
            if (!author) continue;

            if (author.username === user.username || !author.isPrivate || author.followers.includes(user.username)) {
                filteredPosts.push(post);
            }
        }
        res.json(filteredPosts);
    } catch (err) {
        res.status(500).json({ error: 'Feed interpolation loop processing error.' });
    }
});

app.post('/api/messages/send', async (req, res) => {
    try {
        const { sender, receiver, text } = req.body;
        const actor = await User.findOne({ username: sender.toLowerCase() });
        const target = await User.findOne({ username: receiver.toLowerCase() });

        if (!actor || !target) return res.status(404).json({ error: 'Communication endpoint unverified.' });

        if (target.allowMessagesFrom === 'none') {
            return res.status(403).json({ error: 'Permission Denied: Recipient restricts communication channels.' });
        }
        if (target.allowMessagesFrom === 'following' && !target.following.includes(actor.username)) {
            return res.status(403).json({ error: 'Permission Denied: Recipient requires a mutual connection.' });
        }

        let preApproved = (!target.isPrivate || target.following.includes(actor.username));

        const msg = new DirectMessage({
            sender: actor.username,
            receiver: target.username,
            text: text.trim(),
            isAccepted: preApproved
        });

        await msg.save();
        res.json({ message: 'Communication transaction saved to server.', data: msg });
    } catch (err) {
        res.status(500).json({ error: 'Failed to process message allocation.' });
    }
});

app.get('/api/messages/thread/:userA/:userB', async (req, res) => {
    try {
        const uA = req.params.userA.toLowerCase();
        const uB = req.params.userB.toLowerCase();

        const messages = await DirectMessage.find({
            $or: [
                { sender: uA, receiver: uB },
                { sender: uB, receiver: uA }
            ]
        }).sort({ createdAt: 1 });

        res.json(messages);
    } catch (err) {
        res.status(500).json({ error: 'Failed to compile thread records.' });
    }
});

app.post('/api/cron/purge', async (req, res) => {
    try {
        const activePostsList = await ActivePost.find({});
        for (let post of activePostsList) {
            const profile = await User.findOne({ username: post.username });
            if (profile) {
                const archiveBlock = {
                    img: post.img,
                    caption: post.caption,
                    likes: post.likes,
                    medals: post.medals,
                    broccolis: post.broccolis,
                    initial: post.initial,
                    fullName: post.fullName,
                    username: post.username,
                    avatarImg: post.avatarImg
                };
                profile.hallOfFame.push(archiveBlock);
                profile.hallOfFame.sort((alpha, beta) => beta.likes - alpha.likes);
                if (profile.hallOfFame.length > 3) {
                    profile.hallOfFame = profile.hallOfFame.slice(0, 3);
                }
                await profile.save();
            }
        }
        await ActivePost.deleteMany({});
        res.json({ message: 'Server expiration cycle processed.' });
    } catch (err) {
        res.status(500).json({ error: 'Automated daemon cycle failed.' });
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server node active on port allocation: ${PORT}`));