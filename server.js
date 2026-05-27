const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(cors());

const MONGO_URI = "mongodb+srv://silvershot_dev:aKa4ohr$@silvershotcluster.wexyaxl.mongodb.net/silvershot_db?retryWrites=true&w=majority";

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
    
    // Relationship Arrays
    followers: { type: [String], default: [] },
    following: { type: [String], default: [] },
    followRequests: { type: [String], default: [] },
    
    // Privacy Profile Configurations
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
    isAccepted: { type: Boolean, default: false } // False filters item into Message Requests queue
});
const DirectMessage = mongoose.model('DirectMessage', DirectMessageSchema);

// --- SECURE AUTHENTICATION ENDPOINTS ---

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

// --- UPDATED PRIVACY & PROFILE UPDATE ROUTE ---

app.put('/api/profile/update', async (req, res) => {
    try {
        const { username, fullName, bio, age, status, country, avatarString, isPrivate, hideFollowersList, allowMessagesFrom } = req.body;
        
        const profile = await User.findOneAndUpdate(
            { username: username.toLowerCase() },
            { fullName, bio, age, status, country, avatarString, isPrivate, hideFollowersList, allowMessagesFrom },
            { new: true }
        );
        
        if (!profile) return res.status(404).json({ error: 'Profile not found.' });
        
        // Synchronize display name updates across active posts instantly
        await ActivePost.updateMany({ username: profile.username }, { fullName: profile.fullName, avatarImg: profile.avatarString });
        
        res.json({ message: 'Profile variables and permission mappings saved.', user: profile });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update profile configurations.' });
    }
});

// --- RELATIONSHIP ROUTING CONTROLLERS ---

// Follow/Request Action Dispatcher Node
app.post('/api/relations/follow', async (req, res) => {
    try {
        const { sender, target } = req.body; // Expects lowercase username strings
        const actor = await User.findOne({ username: sender.toLowerCase() });
        const recipient = await User.findOne({ username: target.toLowerCase() });

        if (!actor || !recipient) return res.status(404).json({ error: 'User nodes unverified.' });
        if (actor.following.includes(recipient.username)) return res.status(400).json({ error: 'Connection already exists.' });

        if (recipient.isPrivate) {
            if (recipient.followRequests.includes(actor.username)) {
                return res.json({ message: 'Follow request remains pending inside the network queue.' });
            }
            recipient.followRequests.push(actor.username);
            await recipient.save();
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

// Approve Pending Follow Request Node
app.post('/api/relations/accept', async (req, res) => {
    try {
        const { owner, applicant } = req.body;
        const self = await User.findOne({ username: owner.toLowerCase() });
        const target = await User.findOne({ username: applicant.toLowerCase() });

        if (!self || !target) return res.status(404).json({ error: 'Nodes missing.' });

        self.followRequests = self.followRequests.filter(u => u !== target.username);
        if (!self.followers.includes(target.username)) {
            self.followers.push(target.username);
            target.following.push(self.username);
        }

        await self.save();
        await target.save();
        res.json({ message: 'Follow connection validated and synchronized.' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to execute approval process.' });
    }
});

// --- TIMELINE STREAM INTERPOLATOR (FYP FILTERING) ---

app.get('/api/feed/:username', async (req, res) => {
    try {
        const user = await User.findOne({ username: req.params.username.toLowerCase() });
        if (!user) return res.status(404).json({ error: 'User workspace unverified.' });

        // Fetch all active posts inside the cloud data collection pool
        const posts = await ActivePost.find({});
        
        // Filter out private timeline data unless explicit following rules match
        const filteredPosts = [];
        for (let post of posts) {
            const author = await User.findOne({ username: post.username });
            if (!author) continue;

            if (author.username === user.username) {
                filteredPosts.push(post);
            } else if (!author.isPrivate) {
                filteredPosts.push(post);
            } else if (author.isPrivate && author.followers.includes(user.username)) {
                // Connection confirmation verified: include the private author's active post in feed array
                filteredPosts.push(post);
            }
        }
        res.json(filteredPosts);
    } catch (err) {
        res.status(500).json({ error: 'Feed interpolation loop processing error.' });
    }
});

// --- COMMUNICATION INTERACTION ENDPOINTS (DIRECT MESSAGING) ---

// Transmit Message Asset Node
app.post('/api/messages/send', async (req, res) => {
    try {
        const { sender, receiver, text } = req.body;
        const actor = await User.findOne({ username: sender.toLowerCase() });
        const target = await User.findOne({ username: receiver.toLowerCase() });

        if (!actor || !target) return res.status(404).json({ error: 'Communication endpoint unverified.' });

        // Enforce communication security parameters set by recipient profile documentation
        if (target.allowMessagesFrom === 'none') {
            return res.status(403).json({ error: 'Permission Denied: Recipient restricts incoming messaging channels.' });
        }
        if (target.allowMessagesFrom === 'following' && !target.following.includes(actor.username)) {
            return res.status(403).json({ error: 'Permission Denied: Recipient requires a mutual connection setup first.' });
        }

        // Evaluate whether message routes standardly or goes to request queue
        let preApproved = false;
        if (target.following.includes(actor.username) || !target.isPrivate) {
            preApproved = true;
        }

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

// Fetch Active Conversation Thread Array Node
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
        res.status(500).json({ error: 'Failed to compile communication thread database records.' });
    }
});

// --- EXPIRATION DAEMON PIPELINE ---

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
        res.json({ message: 'Server expiration cycle processed. Timeline feed wiped.' });
    } catch (err) {
        res.status(500).json({ error: 'Automated daemon cycle evaluation failed.' });
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server node active on port allocation: ${PORT}`));