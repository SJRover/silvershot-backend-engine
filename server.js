const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');

const app = express();
app.use(express.json({ limit: '15mb' }));
app.use(cors());

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
    hallOfFame: { type: Array, default: [] }, // Preserved top performing historical assets
    followers: { type: [String], default: [] },
    following: { type: [String], default: [] },
    followRequests: { type: [String], default: [] },
    isPrivate: { type: Boolean, default: false },
    hideFollowersList: { type: Boolean, default: false },
    allowMessagesFrom: { type: String, enum: ['everyone', 'following', 'none'], default: 'everyone' },
    lastMedalUsedAt: { type: Date, default: null },   // Tracks 24-hour reset limits
    lastBroccoliUsedAt: { type: Date, default: null } // Tracks 24-hour reset limits
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
    hashtags: { type: [String], default: [] },
    likes: { type: Number, default: 0 },
    medals: { type: Number, default: 0 },
    broccolis: { type: Number, default: 0 },
    likedBy: { type: [String], default: [] },
    medaledBy: { type: [String], default: [] },
    broccoliedBy: { type: [String], default: [] },
    createdAt: { type: Date, default: Date.now }
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

// --- INTERACTIVE REACTION ROUTE WITH 24H RESETS ---
app.post('/api/posts/react', async (req, res) => {
    try {
        const { postId, username, reactionType } = req.body;
        const targetPost = await ActivePost.findById(postId);
        if (!targetPost) return res.status(404).json({ error: 'Target timeline asset unresolved.' });

        const userToken = username.trim().toLowerCase();
        const profile = await User.findOne({ username: userToken });
        if (!profile) return res.status(404).json({ error: 'User node unverified.' });

        const timestampNow = new Date();

        if (reactionType === 'like') {
            // Likes remain unlimited across different posts, toggled strictly per post instance
            if (targetPost.likedBy.includes(userToken)) {
                targetPost.likedBy = targetPost.likedBy.filter(u => u !== userToken);
            } else {
                targetPost.likedBy.push(userToken);
            }
            targetPost.likes = targetPost.likedBy.length;
        } 
        else if (reactionType === 'medal') {
            // Enforce restriction of 1 usage per 24 hours
            const timePassed = profile.lastMedalUsedAt ? (timestampNow - new Date(profile.lastMedalUsedAt)) : Infinity;
            const hoursRemaining = 24 - (timePassed / (1000 * 60 * 60));

            if (hoursRemaining > 0 && !targetPost.medaledBy.includes(userToken)) {
                return res.status(403).json({ error: 'Medal resource locked inside reload cycle constraint.' });
            }

            if (targetPost.medaledBy.includes(userToken)) {
                targetPost.medaledBy = targetPost.medaledBy.filter(u => u !== userToken);
            } else {
                targetPost.medaledBy.push(userToken);
                profile.lastMedalUsedAt = timestampNow;
            }
            targetPost.medals = targetPost.medaledBy.length;
            await profile.save();
        } 
        else if (reactionType === 'broccoli') {
            // Enforce restriction of 1 usage per 24 hours
            const timePassed = profile.lastBroccoliUsedAt ? (timestampNow - new Date(profile.lastBroccoliUsedAt)) : Infinity;
            const hoursRemaining = 24 - (timePassed / (1000 * 60 * 60));

            if (hoursRemaining > 0 && !targetPost.broccoliedBy.includes(userToken)) {
                return res.status(403).json({ error: 'Broccoli resource locked inside reload cycle constraint.' });
            }

            if (targetPost.broccoliedBy.includes(userToken)) {
                targetPost.broccoliedBy = targetPost.broccoliedBy.filter(u => u !== userToken);
            } else {
                targetPost.broccoliedBy.push(userToken);
                profile.lastBroccoliUsedAt = timestampNow;
            }
            targetPost.broccolis = targetPost.broccoliedBy.length;
            await profile.save();
        }

        await targetPost.save();
        res.json({ 
            likes: targetPost.likes, 
            medals: targetPost.medals, 
            broccolis: targetPost.broccolis,
            likedBy: targetPost.likedBy,
            medaledBy: targetPost.medaledBy,
            broccoliedBy: targetPost.broccoliedBy,
            lastMedalUsedAt: profile.lastMedalUsedAt,
            lastBroccoliUsedAt: profile.lastBroccoliUsedAt
        });
    } catch (err) {
        res.status(500).json({ error: 'Metric pipeline modification failure.' });
    }
});

// --- WEIGHTED SEARCH ALGORITHM ENDPOINT ---
app.get('/api/search', async (req, res) => {
    try {
        const rawQuery = req.query.q ? req.query.q.trim().toLowerCase() : '';
        if (!rawQuery) return res.json({ users: [], posts: [] });

        const cleanedQuery = rawQuery.replace('#', '');

        const globalUsersList = await User.find({});
        const categorizedUsers = globalUsersList.map(profile => {
            let relevanceRank = 0;
            if (profile.username === cleanedQuery) relevanceRank += 100;
            else if (profile.username.includes(cleanedQuery)) relevanceRank += 50;
            if (profile.fullName.toLowerCase().includes(cleanedQuery)) relevanceRank += 30;
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

        const globalPostsList = await ActivePost.find({});
        const categorizedPosts = globalPostsList.map(post => {
            let relevanceRank = 0;
            if (post.hashtags && post.hashtags.includes(cleanedQuery)) relevanceRank += 80;
            if (post.caption.toLowerCase().includes(cleanedQuery)) relevanceRank += 40;
            if (post.username === cleanedQuery) relevanceRank += 20;
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

// --- PLATFORM SECURITY ACCESS AND AUTHENTICATION INSTANTIATION PANELS ---
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
            lastMedalUsedAt: accountMatch.lastMedalUsedAt,
            lastBroccoliUsedAt: accountMatch.lastBroccoliUsedAt,
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
            hashtags: hashtags || []
        });

        await postEntry.save();

        // AUTOMATIC ALLOCATION INTO DISCOVERY GRID FOR NEW ACCOUNTS (First 3 posts guarantee layout slots)
        if (profile.hallOfFame.length < 3) {
            const previewBlock = {
                _id: postEntry._id,
                img: postEntry.img,
                caption: postEntry.caption,
                likes: postEntry.likes,
                medals: postEntry.medals,
                broccolis: postEntry.broccolis,
                initial: postEntry.initial,
                fullName: postEntry.fullName,
                username: postEntry.username,
                avatarImg: postEntry.avatarImg,
                hashtags: postEntry.hashtags,
                createdAt: postEntry.createdAt
            };
            profile.hallOfFame.push(previewBlock);
            await profile.save();
        }

        res.json({ message: 'Asset loaded onto live timeline successfully.', activePost: postEntry, userHallOfFame: profile.hallOfFame });
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
                    _id: post._id,
                    img: post.img,
                    caption: post.caption,
                    likes: post.likes,
                    medals: post.medals,
                    broccolis: post.broccolis,
                    initial: post.initial,
                    fullName: post.fullName,
                    username: post.username,
                    avatarImg: post.avatarImg,
                    hashtags: post.hashtags,
                    createdAt: post.createdAt
                };

                // Filter out duplicates if it already landed inside the showcase initially
                profile.hallOfFame = profile.hallOfFame.filter(item => String(item._id) !== String(post._id));
                profile.hallOfFame.push(archiveBlock);
                
                // Keep the top 3 highest performing posts preserved standardly
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