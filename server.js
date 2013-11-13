/* jshint node:true */

var fs = require('fs');

// My stuff
var envFilePath = './env.js';
var envFileExists = fs.existsSync(envFilePath);
if (envFileExists) {
  require(envFilePath);
}

// Themes
var themes = {
  'Medieval Fantasy': require('./themes/MedievalFantasy'),
  'Science Fiction': require('./themes/ScienceFiction')
};

console.log('Flexing the Theme muscles...');
console.log(themes['Medieval Fantasy'].generate());
console.log(themes['Science Fiction'].generate());
console.log('Feels good... Feels right.');

// Someone else's stuff
var _ = require('lodash');
var async = require('async');
var RSS = require('rss');

// Express stuff
var express = require('express');
var passport = require('passport');
var util = require('util');
var TwitterStrategy = require('passport-twitter').Strategy;
var ejsLocals = require('ejs-locals');
var flash = require('connect-flash');

// Mongo stuff
var mongoose = require('mongoose');
mongoose.connect(process.env.MONGO_CONNECTION_STRING);
var db = mongoose.connection;
db.on('error', console.error.bind(console, 'connection error:'));
db.once('open', function callback () {
  console.log('Connected to database. aw ye');
});
var User = require('./models/User.js');
var Story = require('./models/Story.js');
var Chapter = require('./models/Chapter.js');
var Watching = require('./models/Watching.js');
var Invite = require('./models/Invite.js');

passport.serializeUser(function(user, done) {
  done(null, user);
});

passport.deserializeUser(function(obj, done) {
  done(null, obj);
});

passport.use(new TwitterStrategy({
    consumerKey: process.env.TWITTER_CONSUMER_KEY,
    consumerSecret: process.env.TWITTER_CONSUMER_SECRET,
    callbackURL: '/auth/twitter/callback'
  },
  function(token, tokenSecret, profile, done) {
    User.find({
      twitterConsumerKey: token,
      twitterConsumerSecret: tokenSecret
    }, function(err, users) {
      if (err) {
        return done(err);
      }
      if (users.length === 1) {
        return done(null, users[0]);
      }
      else if (users.length > 1) {
        console.error('Duplicate users for ' + profile.username);
      }
      else {
        var user = new User({
          id: profile.id,
          name: profile.username.toLowerCase(),
          twitterConsumerKey: token,
          twitterConsumerSecret: tokenSecret,
          influence: {}
        });
        user.save(function (err, newUser) {
          if (err) {
            return done(err);
          }
          newUser.onCreate();
          return done(null, newUser);
        });
      }
    });
  }
));

var app = express();

app.configure(function() {
  app.engine('ejs', ejsLocals);
  app.set('views', __dirname + '/views');
  app.set('view engine', 'ejs');
  app.use(express.cookieParser());
  app.use(express.bodyParser());
  app.use(express.methodOverride());
  app.use(express.session({secret: process.env.COOKIE_SECRET}));
  app.use(flash());
  app.use(passport.initialize());
  app.use(passport.session());
  app.use(function(req, res, next){
    res.locals.user = req.user;
    res.locals.info = req.flash('info');
    res.locals.error = req.flash('error');
    res.locals.reward = req.flash('reward');
    res.locals.rss = null;
    res.locals.title = 'An Ancient Tome';
    next();
  });
  app.use(app.router);
  var oneDay = 86400000;
  app.use(express.static(__dirname + '/static', {maxAge: oneDay}));
  app.use(express.logger());
});

function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  else {
    req.user = null;
  }
  res.redirect('/');
}

app.get('/', function(req, res) {
  if (req.isAuthenticated()) {
    res.redirect('/home');
  }
  else {
    res.render('index');
  }
});

app.get('/home', ensureAuthenticated, function(req, res) {
  async.parallel([
    function(callback) {
      Story.find({owner: req.user.id}, callback);
    },
    function(callback) {
      Watching.find({user: req.user.id}, callback);
    },
    function(callback) {
      Invite.find({invited: req.user.name.toLowerCase()}, callback);
    }
  ],
  function(err, results) {
    if (err) {
      console.error(err);
    }

    var stories = results[0];
    var watching = results[1];
    var invites = results[2];

    Chapter.find({
      'created': {
        '$gte': new Date().getTime() - 259200000
      }
    })
    .where('story').in(_.union(_.pluck(stories, '_id'),
                               _.pluck(watching, 'story')))
    .where('author').ne(req.user.id)
    .sort({'created': -1})
    .limit(50)
    .exec(function(err, chapters) {
      if (err) {
        console.error(err);
      }

      watching.forEach(function(w) {
        var invited = _.find(invites, {
          story: w.story,
          accepted: true
        }) !== undefined;
        if (w.write === 'public' ||
           (w.write === 'invite' && invited)) {
          w.canWrite = true;
        }
        w.inviteAccepted = invited;
      });

      var storyNames = {};
      stories.forEach(function(story) {
        storyNames[story._id] = story.title;
      });
      watching.forEach(function(watch) {
        storyNames[watch.story] = watch.title;
      });

      if (!chapters) {
        chapters = [];
      }

      res.render('home', {
        stories: stories,
        watching: watching,
        newInvites: _.where(invites, {accepted: false}),
        firstRecentChapters: _.first(chapters, 5),
        restRecentChapters: _.rest(chapters, 5),
        storyNames: storyNames
      });
    });
  });
});

app.get('/account', ensureAuthenticated, function(req, res){
  res.render('account');
});

app.get('/account/delete', ensureAuthenticated, function(req, res) {
  User.remove(req.user, function(err) {
    if (err) {
      console.error(err);
      req.flash('info', 'Woops, it wouldn\'t die. Sorry...?');
      res.redirect('/account');
      return;
    }
    req.logout();
    req.flash('info', 'Account deleted. Goodbye forever apparently!');
    res.redirect('/');
  });
});

app.get('/login', function(req, res){
  res.render('login');
});

app.get('/auth/twitter',
  passport.authenticate('twitter'),
  function(req, res) {});

app.get('/auth/twitter/callback',
  passport.authenticate('twitter', {
    successRedirect: '/home',
    failureRedirect: '/login'
  }));

app.get('/logout', function(req, res){
  req.logout();
  res.redirect('/');
});

app.get('/new', ensureAuthenticated, function(req, res) {
  res.render('new', {themes: Object.keys(themes)});
});

app.post('/new/post', ensureAuthenticated, function(req, res) {
  var success = true;

  if (!req.body.title) {
    success = false;
    req.flash('error', 'You need a title!');
  }
  else if (req.body.title.length < 3) {
    success = false;
    req.flash('error', 'Your title needs to be longer!');
  }
  else if (req.body.title.length > 80) {
    success = false;
    req.flash('error', 'Your title needs to be shorter!');
  }

  if (!_.contains(Object.keys(themes), req.body.theme)) {
    success = false;
    req.flash('error', 'Invalid theme.');
  }

  if (req.body.read !== 'public' &&
      req.body.read !== 'invite') {
    success = false;
    req.flash('error', 'Unsupported read access level. *robot dance*');
  }

  if (req.body.write !== 'public' &&
      req.body.write !== 'invite' &&
      req.body.write !== 'private') {
    success = false;
    req.flash('error', 'Unsupported write access level. *robot dance*');
  }

  if (req.body.read === 'invite' &&
      req.body.write === 'public') {
    success = false;
    req.flash('error', 'You can\'t have read by invite and writing public.');
  }

  if (success) {

    var story = new Story({
      title: req.body.title,
      owner: req.user.id,
      theme: req.body.theme,
      read: req.body.read,
      write: req.body.write,
      environment: [themes[req.body.theme].generate()]
    });
    story.save(function (err, newStory) {
      if (err) {
        req.flash('error', 'Woops, we accidentally a database. Try again maybe?');
        res.redirect('/new');
        return;
      }
      newStory.onCreate();
      req.flash('info', 'A new story has begun... "' +
                      req.body.title + '"');
      res.redirect('/home');
    });

  }
  else {
    res.redirect('/new');
  }
});

function formatChapters(chapters) {
  chapters.forEach(function(chapter) {
    chapter.formatted = chapter.text.split(/\r?\n/);
  });
  return chapters;
}

app.get('/read/:id', function(req, res) {

  var userId;
  var userName;

  if (!req.isAuthenticated()) {
    req.user = null;
    userId = -1;
    userName = null;
  }
  else {
    userId = req.user.id;
    userName = req.user.name;
  }

  async.parallel([
    function(callback) {
      Story.findById(req.params.id, callback);
    },
    function(callback) {
      Chapter.find({
        story: req.params.id
      }, null, {
        sort: {
          created: 1
        }
      }, callback);
    },
    function(callback) {
      Invite.findOne({
        story: req.params.id,
        invited: userName.toLowerCase(),
        accepted: true
      }, callback);
    },
    function(callback) {
      Watching.findOne({
        user: userId,
        story: req.params.id
      }, callback);
    }
  ],
  function(err, results) {
    var story = results[0];
    var chapters = results[1];
    var invited = results[2] !== null;
    var watching = results[3] !== null;
    if (err) {
      console.error(err);
      req.flash('error', 'Hmm, seems to be missing a few pages. Try again?');
      res.redirect('/home');
      return;
    }
    if (!story) {
      req.flash('error', 'I couldn\'t find that story...');
      res.redirect('/home');
      return;
    }

    var canRead = story.owner === userId ||
                  story.read === 'public' ||
                  (story.read === 'invite' && invited);

    if (!canRead) {
      req.flash('error', 'You must be invited to read that tale.');
      res.redirect('/home');
      return;
    }

    var canWrite = story.owner === userId ||
                   story.write === 'public' ||
                   (story.write === 'invite' && invited);

    if (story.read === 'public') {
      res.locals.rss = '/rss/' + story._id;
    }

    res.locals.title = story.title + ' | An Ancient Tome';

    res.render('read', {
      story: story,
      chapters: formatChapters(chapters),
      canWrite: canWrite,
      userId: userId,
      watching: watching
    });
  });
});

app.get('/read/:story/chapter/:id', function(req, res) {
  var userId;
  var userName = null;

  if (!req.isAuthenticated()) {
    req.user = null;
    userId = -1;
  }
  else {
    userId = req.user.id;
    userName = req.user.name.toLowerCase();
  }

  async.parallel([
    function(callback) {
      Story.findById(req.params.story, callback);
    },
    function(callback) {
      Chapter.find({
        _id: req.params.id,
        story: req.params.story,
      }, callback);
    },
    function(callback) {
      Invite.findOne({
        story: req.params.story,
        invited: userName,
        accepted: true
      }, callback);
    }
  ],
  function(err, results) {
    var story = results[0];
    var chapters = results[1];
    var invited = results[2] !== null;
    if (err) {
      console.error(err);
      req.flash('error', 'Hmm, I can\'t find the right page. Try again?');
      res.redirect('/read/' + req.params.id);
      return;
    }
    if (!story || chapters.length < 1) {
      req.flash('error', 'I couldn\'t find that chapter...');
      res.redirect('/read/' + req.params.id);
      return;
    }

    var canRead = story.owner === userId ||
                  story.read === 'public' ||
                  (story.read === 'invite' && invited);

    var canWrite = story.owner === userId ||
                   story.write === 'public' ||
                   (story.write === 'invite' && invited);

    if (!canRead) {
      req.flash('error', 'You must be invited to read this tale.');
      res.redirect('/home');
      return;
    }

    res.render('chapter', {
      story: story,
      chapters: formatChapters(chapters),
      canWrite: canWrite
    });
  });
});

app.get('/write/:id', ensureAuthenticated, function(req, res) {

  async.parallel([
    function(callback) {
      Story.findById(req.params.id, callback);
    },
    function(callback) {
      Chapter.findOne({
        story: req.params.id
      }, {}, {sort: {'created': -1}}, callback);
    },
    function(callback) {
      User.findById(req.user._id, callback);
    }
  ],
  function(err, results) {
    var story = results[0];
    var lastChapter = results[1];
    var user = results[2];
    // TODO remove this line after a db cleanup
    if (!user.influence) user.influence = {};
    var influence = user.influence[story.id];
    if (err) {
      req.flash('error', 'Hmm, seems to be missing a few pages. Try again?');
      res.redirect('/home');
    }
    else if (!story) {
      req.flash('error', 'I couldn\'t find that story, weird...');
      res.redirect('/home');
    }
    else {
      res.render('write', {
        story: story,
        lastChapter: formatChapters(lastChapter ? [lastChapter] : []),
        influence: influence,
        chapter: req.flash('chapter')
      });
    }
  });
});

app.post('/write/:id', ensureAuthenticated, function(req, res) {

  // Save your work if your post fails and you're redirected back
  req.flash('chapter', req.body.chapter);

  if (req.body.chapter.length > 5000) {
    req.flash('error', 'Your chapter is too long!');
    res.redirect('/write/' + req.params.id);
    return;
  }

  var matches = req.body.chapter.match(/[\w']+/g);

  if (!matches || matches.length < 10 || matches.length > 200) {
    req.flash('error', 'You need at least 10 words and no more than 200 words.');
    res.redirect('/write/' + req.params.id);
    return;
  }

  async.parallel([
    function(callback) {
      Story.findById(req.params.id, callback);
    },
    function(callback) {
      User.findById(req.user._id, callback);
    },
    function(callback) {
      Invite.find({invited: req.user.name.toLowerCase()}, callback);
    },
    function(callback) {
      Chapter.findOne({
        story: req.params.id,
        author: req.user.id
      }, null, {sort: {created: -1}}, callback);
    }
  ],
  function(err, results) {
    var story = results[0];
    var user = results[1];
    var invites = results[2];
    var lastChapter = results[3];
    var lastChapterRecency;
    var chapter;
    var influenceReward;
    if (err) {
      req.flash('error', 'There has been an error.');
      res.redirect('/write/' + req.params.id);
      return;
    }

    var invited = _.find(invites, {
      story: story.id,
      accepted: true
    }) !== undefined;

    if (story.owner !== req.user.id &&
        story.write !== 'public' &&
        !invited) {
      req.flash('error', 'You aren\'t allowed to author this story.');
      res.redirect('/write/' + req.params.id);
    }
    else {

      var removeMatch = req.body.environment && req.body.environment.match(/^remove-(\d)+$/);
      var removeNum;
      var env;

      if (!user.influence) {
        user.influence = {};
        user.markModified('influence');
        user.save(function(err) {
          if (err) console.error(err);
        });
      }

      if (typeof user.influence[story.id] !== 'number' ||
          isNaN(user.influence[story.id])) {
        user.influence[story.id] = 0;
      }

      // Leave Environment the same
      if (!req.body.environment || req.body.environment === 'leave') {
        if (lastChapter) {
          lastChapterRecency = new Date().getTime() - lastChapter.created.getTime();
          if (lastChapterRecency < 12 * 60 * 60 * 1000) {
            influenceReward = 0;
          }
          else if (lastChapterRecency < 36 * 60 * 60 * 1000) {
            influenceReward = 5;
          }
          else if (lastChapterRecency < 3 * 24 * 60 * 60 * 1000) {
            influenceReward = 3;
          }
          else if (lastChapterRecency < 7 * 24 * 60 * 60 * 1000) {
            influenceReward = 1;
          }
          else {
            influenceReward = 0;
          }
        }
        else {
          influenceReward = 5;
        }
        user.influence[story.id] += influenceReward;
        user.markModified('influence');
        user.save(function(err) {
          if (err) console.error(err);
        });
        if (influenceReward > 0) {
          req.flash('reward', 'You\'ve received ' + influenceReward + ' Influence!');
        }
      }

      // Remove something from the Environment
      else if (removeMatch) {
        removeNum = Number(removeMatch[1]) - 1;
        env = story.environment[removeNum];

        if (!env) {
          req.flash('error', 'Invalid Environment. Maybe it changed, try again?');
          res.redirect('/write/' + req.params.id);
          return;
        }
        else if (user.influence[story.id] < 5) {
          req.flash('error', 'You don\'t have enough Influence!');
          res.redirect('/write/' + req.params.id);
          return;
        }
        else {
          story.environment.splice(removeNum, 1);
          user.influence[story.id] -= 5;
          user.markModified('influence');
          story.save(function(err) {
            if (err) console.error(err);
          });
          user.save(function(err) {
            if (err) console.error(err);
          });
          req.flash('reward', 'Paid 5 Influence and removed Environment "' + env + '"');
        }
      }

      // Add something to the environment
      else if (req.body.environment === 'add') {
        if (user.influence[story.id] < 10) {
          req.flash('error', 'You don\'t have enough Influence!');
          res.redirect('/write/' + req.params.id);
          return;
        }
        else {
          env = themes[story.theme] ? themes[story.theme].generate() : 'Invalid Theme.';
          story.environment.push(env);
          user.influence[story.id] -= 10;
          user.markModified('influence');
          story.save(function(err) {
            if (err) console.error(err);
          });
          user.save(function(err) {
            if (err) console.error(err);
          });
          req.flash('reward', 'Paid 10 Influence and added to the Environment: "' + env + '"');
        }
      }

      // Invalid Environment request
      else {
        req.flash('error', 'Invalid Environment. Maybe it changed, try again?');
        res.redirect('/write/' + req.params.id);
        return;
      }

      chapter = new Chapter({
        story: req.params.id,
        author: req.user.id,
        authorName: req.user.name,
        created: new Date(),
        text: req.body.chapter
      });
      chapter.save(function (err, newChapter) {
        if (err) {
          req.flash('error', 'Sorry, I couldn\'t save it. Try again?');
          res.redirect('/home');
        }
        newChapter.onCreate();
        req.flash('chapter', '');
        req.flash('info', 'A new chapter has been written...');
        res.redirect('/read/' + req.params.id);
      });
    }
  });
});

app.get('/delete/:id', ensureAuthenticated, function(req, res) {
  async.parallel([
    function(callback) {
      Watching.remove({story: req.params.id}, callback);
    },
    function(callback) {
      Chapter.remove({story: req.params.id}, callback);
    },
    function(callback) {
      Story.remove({_id: req.params.id, owner: req.user.id}, callback);
    }
  ],
  function(err, results) {
    if (err) {
      console.error(err);
      req.flash('error', 'Couldn\'t delete the story. Sorry...?');
      res.redirect('/home');
    }
    else {
      req.flash('info', 'Story deleted. Fin!');
      res.redirect('/home');
    }
  });
});

app.get('/search', ensureAuthenticated, function(req, res) {
  if (req.query.query !== undefined) {
    var q = Story.find({read: 'public'})
    .limit(20)
    .regex('title', new RegExp(req.query.query, 'i'));
    q.execFind(function(err, stories) {
      if (err) {
        req.flash('error', 'Could not search for some reason.');
        res.render('search', {results: []});
      }
      res.render('search', {results: stories});
      return;
    });
  }
  else {
    res.render('search', {results: null});
  }
});

app.get('/manual', function(req, res) {
  res.render('manual');
});

app.get('/tech', function(req, res) {
  res.render('tech');
});

app.get('/watch/:id', ensureAuthenticated, function(req, res) {
  async.parallel([
    function(callback) {
      Watching.findOne({
        story: req.params.id,
        user: req.user.id
      }, callback);
    },
    function(callback) {
      Story.findOne({_id: req.params.id}, callback);
    }
  ],
  function(err, results) {
    var watching = results[0];
    var story = results[1];
    if (err) {
      req.flash('error', 'Could not watch this story. Weird.');
    }
    else {
      if (story.owner === req.user.id) {
        req.flash('info', 'You are automatically watching your own stories.');
        res.redirect('/read/' + req.params.id);
      }
      else if (watching) {
        req.flash('info', 'You\'re already watching ' + story.title);
        res.redirect('/read/' + req.params.id);
      }
      else if (!story) {
        req.flash('error', 'Couldn\'t find that story.');
        res.redirect('/home');
      }
      else {
        var newWatching = new Watching({
          user: req.user.id,
          story: story.id,
          title: story.title,
          theme: story.theme,
          write: story.write
        });
        newWatching.save(function (err, newUser) {
          if (err) {
            req.flash('error', 'Couldn\'t watch that story.');
          }
          else {
            req.flash('info', 'Now watching ' + story.title);
            res.redirect('/read/' + req.params.id);
          }
        });
      }
    }
  });
});

app.get('/unwatch/:id', ensureAuthenticated, function(req, res) {
  Watching.remove({story: req.params.id, user: req.user.id}, function(err) {
    if (err) {
      console.error(err);
      req.flash('error', 'Failed to unwatch. That must be annoying.');
      res.redirect('/home');
    }
    else {
      req.flash('info', 'Unwatched.');
      res.redirect('/home');
    }
  });
});

app.get('/invite/:id', ensureAuthenticated, function(req, res) {
  async.parallel([
    function(callback) {
      Story.findOne({_id: req.params.id}, callback);
    },
    function(callback) {
      Invite.find({inviter: req.user.id, story: req.params.id}, callback);
    }
  ],
  function(err, results) {
    var story = results[0];
    var invites = results[1];
    if (err) {
      console.error(err);
      req.flash('error', 'Something went wrong...');
      res.redirect('/home');
    }
    else if (!story) {
      req.flash('error', 'Can\'t find that story...');
      res.redirect('/home');
    }
    else {
      res.render('invite', {story: story, invites: invites});
    }
  });
});

app.post('/invite/:id/post', ensureAuthenticated, function(req, res) {
  async.parallel([
    function(callback) {
      User.findOne({name: req.body.name.toLowerCase()}, callback);
    },
    function(callback) {
      Invite.findOne({
        inviter: req.user.id,
        invited: req.body.name.toLowerCase(),
        story: req.params.id
      }, callback);
    },
    function(callback) {
      Story.findOne({_id: req.params.id}, callback);
    }
  ],
  function(err, results) {
    var newInvite;
    var user = results[0];
    var invite = results[1];
    var story = results[2];
    if (err) {
      console.error(err);
      req.flash('error', 'Something went wrong...');
      res.redirect('/invite/' + req.params.id);
    }
    else if (!user) {
      req.flash('error', 'No user with the Twitter name "' + req.body.name +
                         '". Maybe tell them to create an account?');
      res.redirect('/invite/' + req.params.id);
    }
    else if (invite) {
      req.flash('error', 'Looks like ' + req.body.name +
                         ' is already invited!');
      res.redirect('/invite/' + req.params.id);
    }
    else if (!story) {
      req.flash('error', 'That story doesn\'t exist!');
      res.redirect('/home');
    }
    else if (story.write !== 'invite') {
      req.flash('error', 'This story doesn\'t do invitations.');
      res.redirect('/invite/' + req.params.id);
    }
    else {
      newInvite = new Invite({
        inviter: req.user.id,
        invited: req.body.name.toLowerCase(),
        story: req.params.id,
        title: story.title,
        theme: story.theme,
        write: story.write,
        from: req.user.name,
        accepted: false
      });
      newInvite.save(function (err) {
        if (err) {
          console.error(err);
          req.flash('error', 'Something went wrong...');
          res.redirect('/invite/' + req.params.id);
        }
        else {
          req.flash('info', 'Yay, ' + req.body.name +
                             ' has been invited!');
          res.redirect('/invite/' + req.params.id);
        }
      });
    }
  });
});

app.get('/invite/accept/:id', ensureAuthenticated, function(req, res) {
  Invite.findOne({_id: req.params.id, invited: req.user.name.toLowerCase()}, function(err, invite) {
    if (err) {
      console.error(err);
      req.flash('error', 'Couldn\'t find that invite...');
      res.redirect('/home');
    }
    else {
      invite.accepted = true;
      invite.save(function(err) {
        if (err) {
          console.error(err);
          req.flash('error', 'Something went wrong!');
          res.redirect('/home');
        }
        else {
          var newWatching = new Watching({
            user: req.user.id,
            story: invite.story,
            title: invite.title,
            theme: invite.theme,
            write: invite.write
          });
          newWatching.save(function (err, newUser) {
            if (err) {
              req.flash('error', 'An error happened.');
              res.redirect('/home');
            }
            else {
              req.flash('info', 'You are now watching ' + invite.title + ' and can write to it.');
              res.redirect('/home');
            }
          });
        }
      });
    }
  });
});

app.get('/invite/reject/:id', ensureAuthenticated, function(req, res) {
  Invite.remove({_id: req.params.id, invited: req.user.name.toLowerCase()}, function(err, invite) {
    if (err) {
      console.error(err);
      req.flash('error', 'Something went wrong!');
    }
    else {
      req.flash('info', 'Politely declined.');
    }
    res.redirect('/home');
  });
});

app.get('/random', ensureAuthenticated, function(req, res) {
  Story.random(function(err, story) {
    if (err || story === null) {
      if (err) console.error(err);
      req.flash('error', 'Sorry, they were all so awesome I couldn\'t choose!');
      res.redirect('/home');
    }
    else {
      res.redirect('/read/' + story.id);
    }
  });
});

app.get('/rss/all', function(req, res) {

  var stories = {};

  async.parallel([
    function(callback) {
      Chapter.find({}, null, {
        limit: 30,
        sort: {'created': -1}
      }, callback);
    }
  ],
  function(err, results) {
    var chapters = results[0];

    if (err) {
      console.error(err);
      res.send(404, 'Something is amiss...');
      return;
    }

    var feed = new RSS({
      title: 'An Ancient Tome',
      description: 'All Public Stories',
      feed_url: 'http://anancienttome.com/rss/all',
      site_url: 'http://anancienttome.com'
    });

    var stories = {};
    chapters.forEach(function(chapter) {
      stories[chapter.story] = true;
    });

    var loadStories = [];
    _.keys(stories).forEach(function(storyId) {
      loadStories.push(function(callback) {
        Story.findById(storyId, callback);
      });
    });

    async.parallel(loadStories, function(err, results) {
      if (err) {
        console.error(err);
        res.send(404, 'Something is amiss...');
        return;
      }
      results.forEach(function(story) {
        stories[story._id] = story;
      });
      var i = 0;
      chapters.forEach(function(chapter) {
        var story = stories[chapter.story];
        if (i < 10 && story.read === 'public') {
          i++;
          feed.item({
            title: story.title,
            description: chapter.text,
            url: 'http://anancienttome.com/read/' + story._id +
                 '/chapter/' + chapter._id,
            author: chapter.authorName,
            date: chapter.created
          });
        }
      });
      res.header('Content-Type', 'application/rss+xml');
      res.send(200, feed.xml());
    });

  });
});

app.get('/rss/:id', function(req, res) {

  async.parallel([
    function(callback) {
      Story.findById(req.params.id, callback);
    },
    function(callback) {
      Chapter.find({story: req.params.id}, null,
      {
        limit: 10,
        sort: {
          created: -1
        }
      }, callback);
    }
  ],
  function(err, results) {
    var story = results[0];
    var chapters = results[1];
    if (err) {
      console.error(err);
    }
    var canRead = story && story.read === 'public';
    if (!err && story && canRead) {
      var feed = new RSS({
        title: story.title,
        description: 'You pick up An Ancient Tome...',
        feed_url: 'http://anancienttome.com/rss/' + req.params.id,
        site_url: 'http://anancienttome.com'
      });
      chapters.forEach(function(chapter) {
        feed.item({
          title: 'A Chapter by ' + chapter.authorName,
          description: chapter.text,
          url: 'http://anancienttome.com/read/' + story._id +
               '/chapter/' + chapter._id,
          author: chapter.authorName,
          date: chapter.created
        });
      });
      res.header('Content-Type', 'application/rss+xml');
      res.send(200, feed.xml());
    }
    else {
      res.send(404, 'I\'ve never heard of that story...');
    }
  });
});

var port = 8080;
app.listen(port);
console.info('Listening on ' + port + '. heck ya');
