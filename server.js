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
    bio: { type: String, default: 'Sharing creative media items across the network.' },
    age: { type: Number, default: 24 },
    status: { type: String, default: 'Single' },
    country: { type: String, default: 'United Kingdom' },
    avatarString: { type: String, default: null },
    hallOfFame: { type: Array, default: [] },
    followers: { type: [String], default: [] },
    following: { type: [String], default: [] },
    followRequests: { type: [String], default: [] },
    blockedUsers: { type: [String], default: [] }, 
    isPrivate: { type: Boolean, default: false },
    pgFriendly: { type: Boolean, default: false }, 
    darkMode: { type: Boolean, default: false },   
    hideFollowersList: { type: Boolean, default: false },
    allowMessagesFrom: { type: String, enum: ['everyone', 'following', 'none'], default: 'everyone' },
    lastMedalUsedAt: { type: Date, default: null },
    lastBroccoliUsedAt: { type: Date, default: null },
    weeklyScore: { type: Number, default: 0 },
    currentWeeklyRank: { type: String, default: 'Unranked' },
    highestWeeklyRank: { type: String, default: 'Unranked' },
    isAdmin: { type: Boolean, default: false }
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

const NotificationSchema = new mongoose.Schema({
    username: { type: String, required: true, lowercase: true },
    type: { type: String, enum: ['like', 'medal', 'broccoli', 'follow', 'follow_request', 'message_request'], required: true },
    fromUser: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
});
const Notification = mongoose.model('Notification', NotificationSchema);

// --- RANKING SYSTEM ALGORITHM WORKBENCH ---

async function computeGlobalWeeklyRankings() {
    try {
        const posts = await ActivePost.find({});
        const userScores = {};

        const allUsers = await User.find({});
        allUsers.forEach(u => { userScores[u.username] = 0; });

        posts.forEach(post => {
            const author = post.username.toLowerCase();
            if (userScores[author] !== undefined) {
                const scoreCalculation = (post.likes * 1) + (post.medals * 25) - (post.broccolis * 10);
                userScores[author] += scoreCalculation;
            }
        });

        for (const username in userScores) {
            await User.findOneAndUpdate({ username }, { weeklyScore: userScores[username] });
        }

        const sortedRankings = await User.find({}).sort({ weeklyScore: -1 });
        
        for (let index = 0; index < sortedRankings.length; index++) {
            const userRecord = sortedRankings[index];
            const currentPosition = index + 1;
            let currentRankString = `${currentPosition}`;
            if (currentPosition === 1) currentRankString += 'st';
            else if (currentPosition === 2) currentRankString += 'nd';
            else if (currentPosition === 3) currentRankString += 'rd';
            else currentRankString += 'th';

            let absoluteHighest = userRecord.highestWeeklyRank;
            if (absoluteHighest === 'Unranked') {
                absoluteHighest = currentRankString;
            } else {
                const pureHighestInteger = parseInt(absoluteHighest);
                if (currentPosition < pureHighestInteger) {
                    absoluteHighest = currentRankString;
                }
            }

            await User.findByIdAndUpdate(userRecord._id, {
                currentWeeklyRank: currentRankString,
                highestWeeklyRank: absoluteHighest
            });
        }
    } catch (err) {
        console.error('Error generating ranking calculations:', err);
    }
}

// --- ADMINISTRATIVE ROUTING ENDPOINTS ---

app.delete('/api/admin/posts/:postId', async (req, res) => {
    try {
        const { adminUsername } = req.body;
        const adminAccount = await User.findOne({ username: adminUsername.toLowerCase() });
        if (!adminAccount || !adminAccount.isAdmin) {
            return res.status(403).json({ error: 'Security Exception: Denied administrative authority access.' });
        }
        await ActivePost.findByIdAndDelete(req.params.postId);
        res.json({ message: 'Post removed successfully by administrative moderation action.' });
    } catch (err) {
        res.status(500).json({ error: 'Administrative post deletion channel failed.' });
    }
});

app.delete('/api/admin/users/:targetUsername', async (req, res) => {
    try {
        const { adminUsername } = req.body;
        const adminAccount = await User.findOne({ username: adminUsername.toLowerCase() });
        if (!adminAccount || !adminAccount.isAdmin) {
            return res.status(403).json({ error: 'Security Exception: Denied administrative authority access.' });
        }
        const offender = req.params.targetUsername.toLowerCase();
        await User.findOneAndDelete({ username: offender });
        await ActivePost.deleteMany({ username: offender });
        res.json({ message: 'User profile and associated posts removed cleanly from database storage clusters.' });
    } catch (err) {
        res.status(500).json({ error: 'Administrative account deletion channel failed.' });
    }
});

// --- USER AUTONOMOUS DELETION ENDPOINT ---
app.post('/api/profile/delete-account', async (req, res) => {
    try {
        const { username, password } = req.body;
        const targetHandle = username.toLowerCase();

        const userAccount = await User.findOne({ username: targetHandle });
        if (!userAccount) return res.status(404).json({ error: 'Identity parameters unresolved.' });

        const isMatch = await bcrypt.compare(password, userAccount.passwordHash);
        if (!isMatch) return res.status(400).json({ error: 'Authentication verified poor evidence matching account password.' });

        await User.findOneAndDelete({ username: targetHandle });
        await ActivePost.deleteMany({ username: targetHandle });
        await DirectMessage.deleteMany({ $or: [{ sender: targetHandle }, { receiver: targetHandle }] });
        await Notification.deleteMany({ username: targetHandle });

        res.json({ message: 'Account history components fully wiped from network parameters.' });
    } catch (err) {
        res.status(500).json({ error: 'Autonomous removal process failed.' });
    }
});

// --- RELATION RELATIONSHIP BLOCK ROUTING ENDPOINTS ---
app.post('/api/relations/block', async (req, res) => {
    try {
        const { username, targetUsername } = req.body;
        const actor = await User.findOne({ username: username.toLowerCase() });
        const target = targetUsername.toLowerCase();

        if (!actor) return res.status(404).json({ error: 'User profile node not verified.' });
        
        if (!actor.blockedUsers.includes(target)) {
            actor.blockedUsers.push(target);
            await actor.save();
        }
        res.json({ message: 'Target profile parameters restricted from dashboard stream feeds.', blockedUsers: actor.blockedUsers });
    } catch (err) {
        res.status(500).json({ error: 'Block execution system failure.' });
    }
});

app.post('/api/relations/unblock', async (req, res) => {
    try {
        const { username, targetUsername } = req.body;
        const actor = await User.findOne({ username: username.toLowerCase() });
        const target = targetUsername.toLowerCase();

        if (!actor) return res.status(404).json({ error: 'User profile node not verified.' });

        actor.blockedUsers = actor.blockedUsers.filter(u => u !== target);
        await actor.save();
        res.json({ message: 'Target interaction rules normalized.', blockedUsers: actor.blockedUsers });
    } catch (err) {
        res.status(500).json({ error: 'Unblock execution system failure.' });
    }
});

// --- GET TOP 25 LEADERBOARD ---
app.get('/api/ranking/leaderboard', async (req, res) => {
    try {
        await computeGlobalWeeklyRankings();
        const topAccounts = await User.find({})
            .sort({ weeklyScore: -1 })
            .limit(25)
            .select('username fullName avatarString weeklyScore currentWeeklyRank');
        res.json(topAccounts);
    } catch (err) {
        res.status(500).json({ error: 'Failed to extract top score rankings.' });
    }
});

// --- NOTIFICATIONS ROUTE ---
app.get('/api/notifications/:username', async (req, res) => {
    try {
        const targetUser = req.params.username.toLowerCase();
        const list = await Notification.find({ username: targetUser }).sort({ createdAt: -1 });
        res.json(list);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch user notifications.' });
    }
});

// --- PROFILE LOOKUP ROUTE ---
app.get('/api/profile/:username', async (req, res) => {
    try {
        await computeGlobalWeeklyRankings();
        const account = await User.findOne({ username: req.params.username.toLowerCase() });
        if (!account) return res.status(404).json({ error: 'Profile not found.' });
        
        const activePost = await ActivePost.findOne({ username: account.username });
        
        res.json({
            username: account.username,
            fullName: account.fullName,
            bio: account.bio,
            age: account.age,
            status: account.status,
            country: account.country,
            avatarString: account.avatarString,
            hallOfFame: account.hallOfFame,
            followers: account.followers,
            following: account.following,
            followRequests: account.followRequests,
            blockedUsers: account.blockedUsers,
            isPrivate: account.isPrivate,
            allowMessagesFrom: account.allowMessagesFrom,
            pgFriendly: account.pgFriendly,
            darkMode: account.darkMode,
            weeklyScore: account.weeklyScore,
            currentWeeklyRank: account.currentWeeklyRank,
            highestWeeklyRank: account.highestWeeklyRank,
            activePost: activePost
        });
    } catch (err) {
        res.status(500).json({ error: 'Failed to retrieve profile records.' });
    }
});

// --- REACTION METRICS ROUTE ---
app.post('/api/posts/react', async (req, res) => {
    try {
        const { postId, username, reactionType } = req.body;
        const targetPost = await ActivePost.findById(postId);
        if (!targetPost) return res.status(404).json({ error: 'Post not found.' });

        const userToken = username.trim().toLowerCase();
        
        if (targetPost.username.toLowerCase() === userToken) {
            return res.status(403).json({ error: 'Interaction restricted: You cannot react to your own upload.' });
        }

        const profile = await User.findOne({ username: userToken });
        if (!profile) return res.status(404).json({ error: 'User not found.' });

        const timestampNow = new Date();
        let createdNewReaction = false;

        if (reactionType === 'like') {
            if (targetPost.likedBy.includes(userToken)) {
                targetPost.likedBy = targetPost.likedBy.filter(u => u !== userToken);
            } else {
                targetPost.likedBy.push(userToken);
                createdNewReaction = true;
            }
            targetPost.likes = targetPost.likedBy.length;
        } 
        else if (reactionType === 'medal') {
            const timePassed = profile.lastMedalUsedAt ? (timestampNow - new Date(profile.lastMedalUsedAt)) : Infinity;
            const hoursRemaining = 24 - (timePassed / (1000 * 60 * 60));
            if (hoursRemaining > 0 && !targetPost.medaledBy.includes(userToken)) {
                return res.status(403).json({ error: 'Medal selection is locked during the cooldown period.' });
            }
            if (targetPost.medaledBy.includes(userToken)) {
                targetPost.medaledBy = targetPost.medaledBy.filter(u => u !== userToken);
            } else {
                targetPost.medaledBy.push(userToken);
                profile.lastMedalUsedAt = timestampNow;
                createdNewReaction = true;
            }
            targetPost.medals = targetPost.medaledBy.length;
            await profile.save();
        } 
        else if (reactionType === 'broccoli') {
            const timePassed = profile.lastBroccoliUsedAt ? (timestampNow - new Date(profile.lastBroccoliUsedAt)) : Infinity;
            const hoursRemaining = 24 - (timePassed / (1000 * 60 * 60));
            if (hoursRemaining > 0 && !targetPost.broccoliedBy.includes(userToken)) {
                return res.status(403).json({ error: 'Broccoli selection is locked during the cooldown period.' });
            }
            if (targetPost.broccoliedBy.includes(userToken)) {
                targetPost.broccoliedBy = targetPost.broccoliedBy.filter(u => u !== userToken);
            } else {
                targetPost.broccoliedBy.push(userToken);
                profile.lastBroccoliUsedAt = timestampNow;
                createdNewReaction = true;
            }
            targetPost.broccolis = targetPost.broccoliedBy.length;
            await profile.save();
        }

        await targetPost.save();

        if (createdNewReaction && userToken !== targetPost.username.toLowerCase()) {
            await new Notification({
                username: targetPost.username,
                type: reactionType,
                fromUser: userToken
            }).save();
        }

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
        res.status(500).json({ error: 'Failed to update post reaction.' });
    }
});

// --- SEARCH ENDPOINT ---
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
        res.status(500).json({ error: 'Search system processing failure.' });
    }
});

// --- CORE DISPATCH ROUTES ---
app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, email, password } = req.body;
        const normalizedHandle = username.trim().toLowerCase();

        const handleMatch = await User.findOne({ username: normalizedHandle });
        if (handleMatch) return res.status(400).json({ error: 'Username is already taken.' });

        const emailMatch = await User.findOne({ email: email.toLowerCase() });
        if (emailMatch) return res.status(400).json({ error: 'Email is linked to an existing account.' });

        const salt = await bcrypt.genSalt(10);
        const hashed = await bcrypt.hash(password, salt);

        const newAccount = new User({
            username: normalizedHandle,
            email: email.toLowerCase(),
            passwordHash: hashed,
            fullName: username
        });

        await newAccount.save();
        res.json({ message: 'Registration finished successfully.' });
    } catch (err) {
        res.status(500).json({ error: 'Server registration failed.' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { loginInput, password } = req.body;
        const queryStr = loginInput.trim().toLowerCase();

        let accountMatch = await User.findOne({ username: queryStr }) || await User.findOne({ email: queryStr });
        if (!accountMatch) return res.status(400).json({ error: 'Account credentials not found.' });

        const checkPass = await bcrypt.compare(password, accountMatch.passwordHash);
        if (!checkPass) return res.status(400).json({ error: 'Incorrect password.' });

        const activeUpload = await ActivePost.findOne({ username: accountMatch.username });
        await computeGlobalWeeklyRankings();

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
            blockedUsers: accountMatch.blockedUsers,
            isPrivate: accountMatch.isPrivate,
            hideFollowersList: accountMatch.hideFollowersList,
            allowMessagesFrom: accountMatch.allowMessagesFrom,
            pgFriendly: accountMatch.pgFriendly,
            darkMode: accountMatch.darkMode,
            weeklyScore: accountMatch.weeklyScore,
            currentWeeklyRank: accountMatch.currentWeeklyRank,
            highestWeeklyRank: accountMatch.highestWeeklyRank,
            lastMedalUsedAt: accountMatch.lastMedalUsedAt,
            lastBroccoliUsedAt: accountMatch.lastBroccoliUsedAt,
            isAdmin: accountMatch.isAdmin, 
            activePost: activeUpload
        });
    } catch (err) {
        res.status(500).json({ error: 'Server authentication failed.' });
    }
});

app.put('/api/profile/update', async (req, res) => {
    try {
        const { username, fullName, bio, age, status, country, avatarString, isPrivate, hideFollowersList, allowMessagesFrom, pgFriendly, darkMode } = req.body;
        
        const profile = await User.findOneAndUpdate(
            { username: username.toLowerCase() },
            { fullName, bio, age, status, country, avatarString, isPrivate, hideFollowersList, allowMessagesFrom, pgFriendly, darkMode },
            { new: true }
        );
        
        if (!profile) return res.status(404).json({ error: 'Profile not found.' });
        await ActivePost.updateMany({ username: profile.username }, { fullName: profile.fullName, avatarImg: profile.avatarString });
        
        res.json({ message: 'Profile updates saved.', user: profile });
    } catch (err) {
        res.status(500).json({ error: 'Failed to save profile changes.' });
    }
});

app.post('/api/posts/upload', async (req, res) => {
    try {
        const { username, img, category, caption, hashtags } = req.body;

        const profile = await User.findOne({ username });
        if (!profile) return res.status(404).json({ error: 'User workspace not found.' });

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

        res.json({ message: 'Post uploaded successfully.', activePost: postEntry, userHallOfFame: profile.hallOfFame });
    } catch (err) {
        res.status(500).json({ error: 'Post upload failed.' });
    }
});

app.post('/api/relations/follow', async (req, res) => {
    try {
        const { sender, target } = req.body;
        const actor = await User.findOne({ username: sender.toLowerCase() });
        const recipient = await User.findOne({ username: target.toLowerCase() });

        if (!actor || !recipient) return res.status(404).json({ error: 'Profiles not found.' });
        if (actor.following.includes(recipient.username)) return res.status(400).json({ error: 'Connection already exists.' });

        if (recipient.isPrivate) {
            if (!recipient.followRequests.includes(actor.username)) {
                recipient.followRequests.push(actor.username);
                await recipient.save();
                
                await new Notification({
                    username: recipient.username,
                    type: 'follow_request',
                    fromUser: actor.username
                }).save();
            }
            return res.json({ status: 'requested', message: 'Follow request submitted successfully.' });
        } else {
            recipient.followers.push(actor.username);
            actor.following.push(recipient.username);
            await recipient.save();
            await actor.save();

            await new Notification({
                username: recipient.username,
                type: 'follow',
                fromUser: actor.username
            }).save();

            return res.json({ status: 'following', message: 'Follow successfully established.' });
        }
    } catch (err) {
        res.status(500).json({ error: 'Follow system processing failure.' });
    }
});

app.get('/api/feed/:username', async (req, res) => {
    try {
        const user = await User.findOne({ username: req.params.username.toLowerCase() });
        if (!user) return res.status(404).json({ error: 'Workspace user not found.' });

        const posts = await ActivePost.find({});
        const filteredPosts = [];

        const bannedContentPhrases = ['explicit', 'offensiveword', 'badtheme', 'inappropriatecontent', 'swarword'];

        for (let post of posts) {
            const authorHandle = post.username.toLowerCase();
            
            if (user.blockedUsers.includes(authorHandle)) continue;

            if (user.pgFriendly) {
                const combinedTextCheck = (post.caption + ' ' + post.hashtags.join(' ')).toLowerCase();
                const holdsInappropriateFlags = bannedContentPhrases.some(phrase => combinedTextCheck.includes(phrase));
                if (holdsInappropriateFlags) continue;
            }

            const author = await User.findOne({ username: post.username });
            if (!author) continue;

            if (author.username === user.username || !author.isPrivate || author.followers.includes(user.username)) {
                filteredPosts.push(post);
            }
        }
        res.json(filteredPosts);
    } catch (err) {
        res.status(500).json({ error: 'Failed to compile stream items.' });
    }
});

app.post('/api/messages/send', async (req, res) => {
    try {
        const { sender, receiver, text } = req.body;
        const actor = await User.findOne({ username: sender.toLowerCase() });
        const target = await User.findOne({ username: receiver.toLowerCase() });

        if (!actor || !target) return res.status(404).json({ error: 'Profiles not found.' });
        if (target.blockedUsers.includes(actor.username)) return res.status(403).json({ error: 'Communication blocked by recipient.' });

        if (target.allowMessagesFrom === 'none') {
            return res.status(403).json({ error: 'Permission Denied: Recipient restricts messaging channels.' });
        }
        if (target.allowMessagesFrom === 'following' && !target.following.includes(actor.username)) {
            return res.status(403).json({ error: 'Permission Denied: Recipient requires a mutual follow link.' });
        }

        let preApproved = (!target.isPrivate || target.following.includes(actor.username));

        const msg = new DirectMessage({
            sender: actor.username,
            receiver: target.username,
            text: text.trim(),
            isAccepted: preApproved
        });

        await msg.save();

        if (!preApproved) {
            await new Notification({
                username: target.username,
                type: 'message_request',
                fromUser: actor.username
            }).save();
        }

        res.json({ message: 'Message delivered to server successfully.', data: msg });
    } catch (err) {
        res.status(500).json({ error: 'Failed to send message content.' });
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
        res.status(500).json({ error: 'Failed to compile messages thread.' });
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

                profile.hallOfFame = profile.hallOfFame.filter(item => String(item._id) !== String(post._id));
                profile.hallOfFame.push(archiveBlock);
                
                profile.hallOfFame.sort((alpha, beta) => beta.likes - alpha.likes);
                if (profile.hallOfFame.length > 3) {
                    profile.hallOfFame = profile.hallOfFame.slice(0, 3);
                }
                await profile.save();
            }
        }
        await ActivePost.deleteMany({});
        await computeGlobalWeeklyRankings();
        res.json({ message: 'Server expiration and ranking cycles processed.' });
    } catch (err) {
        res.status(500).json({ error: 'Automated removal process failed.' });
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port: ${PORT}`));