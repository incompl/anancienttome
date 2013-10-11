/* jshint node:true */

// My stuff
var keys = require('./keys.js');

// Someone else's stuff
var _ = require('lodash');
var async = require('async');

// Express stuff
var express = require('express');
var passport = require('passport');
var util = require('util');
var TwitterStrategy = require('passport-twitter').Strategy;
var ejsLocals = require('ejs-locals');
var flash = require('connect-flash');

// Mongo stuff
var mongoose = require('mongoose');
mongoose.connect(keys.MONGO_CONNECTION_STRING);
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
    consumerKey: keys.TWITTER_CONSUMER_KEY,
    consumerSecret: keys.TWITTER_CONSUMER_SECRET,
    callbackURL: 'http://localhost:8080/auth/twitter/callback'
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
          name: profile.username,
          twitterConsumerKey: token,
          twitterConsumerSecret: tokenSecret
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

var themes = [
  'Medieval Fantasy',
  'Science Fiction'
];

var app = express();

app.configure(function() {
  app.engine('ejs', ejsLocals);
  app.set('views', __dirname + '/views');
  app.set('view engine', 'ejs');
  app.use(express.logger());
  app.use(express.cookieParser());
  app.use(express.bodyParser());
  app.use(express.methodOverride());
  app.use(express.session({secret: 'egg salad egg burrito feast'}));
  app.use(flash());
  app.use(passport.initialize());
  app.use(passport.session());
  app.use(function(req, res, next){
    res.locals.user = req.user;
    res.locals.info = req.flash('info');
    res.locals.error = req.flash('error');
    next();
  });
  app.use(app.router);
  app.use(express.static(__dirname + '/static'));
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

app.get('/', function(req, res){
  res.render('index');
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
      Invite.find({invited: req.user.name, accepted: false}, callback);
    }
  ],
  function(err, results) {
    if (err) {
      console.log(err);
    }
    res.render('home', {
      stories: results[0],
      watching: results[1],
      invites: results[2]
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
  res.render('new', {themes: themes});
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

  if (!_.contains(themes, req.body.theme)) {
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
      write: req.body.write
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

app.get('/read/:id', ensureAuthenticated, function(req, res) {
  Story.findById(req.params.id, function(err, story) {
    if (err) {
      console.log(err);
      req.flash('error', 'I couldn\'t find that story, weird...');
      res.redirect('/home');
    }
    if (!story) {
      req.flash('error', 'I couldn\'t find that story, weird...');
      res.redirect('/home');
    }
    else {
      Chapter.find({
        story: req.params.id
      }, function(err, chapters) {
        if (err) {
          req.flash('error', 'Hmm, seems to be missing a few pages. Try again?');
          res.redirect('/home');
          return;
        }
        res.render('read', {story: story, chapters: chapters});
      });
    }
  });
});

app.get('/write/:id', ensureAuthenticated, function(req, res) {
  Story.findById(req.params.id, function(err, story) {
    if (err) {
      req.flash('error', 'There has been an error, hmm....');
      res.redirect('/home');
    }
    else if (!story) {
      req.flash('error', 'I couldn\'t find that story, weird...');
      res.redirect('/home');
    }
    else {
      Chapter.findOne({
        story: req.params.id,

      }, {}, {sort: {'created': -1}}, function(err, lastChapter) {
        if (err) {
          req.flash('error', 'Hmm, seems to be missing a few pages. Try again?');
          res.redirect('/home');
          return;
        }
        res.render('write', {story: story, lastChapter: lastChapter});
      });
    }
  });
});

app.post('/write/:id/post', ensureAuthenticated, function(req, res) {

  var matches = req.body.chapter.match(/\w+/g);

  if (!matches || matches.length < 10 || matches.length > 200) {
    req.flash('error', 'There has been an error.');
    res.redirect('/write/' + req.params.id);
    return;
  }

  Story.findById(req.params.id, function(err, story) {
    var chapter;
    if (err) {
      req.flash('error', 'There has been an error.');
      res.redirect('/write/' + req.params.id);
    }
    if (story.owner !== req.user.id &&
        story.public !== 'public') {
      req.flash('error', 'You aren\'t allowed to author this story.');
      res.redirect('/write/' + req.params.id);
    }
    else {
      chapter = new Chapter({
        story: req.params.id,
        author: req.user.id,
        created: new Date(),
        text: req.body.chapter
      });
      chapter.save(function (err, newChapter) {
        if (err) {
          req.flash('error', 'Sorry, I couldn\'t save it. Try again?');
          res.redirect('/home');
        }
        newChapter.onCreate();
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

app.get('/watch/:id', ensureAuthenticated, function(req, res) {
  async.parallel([
    function(callback) {
      Watching.findOne({story: req.params.id}, callback);
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
      console.log(err);
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
      console.log(err);
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

// TODO confirm that ID exists
// TODO confirm that the story can be invited to
// TODO put story title
app.post('/invite/:id/post', ensureAuthenticated, function(req, res) {
  async.parallel([
    function(callback) {
      User.findOne({name: req.body.name}, callback);
    },
    function(callback) {
      Invite.findOne({
        inviter: req.user.id,
        invited: req.body.name,
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
      console.log(err);
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
    else {
      newInvite = new Invite({
        inviter: req.user.id,
        invited: req.body.name,
        story: req.params.id,
        title: story.title,
        theme: story.theme,
        write: story.write,
        from: req.user.name,
        accepted: false
      });
      newInvite.save(function (err) {
        if (err) {
          console.log(err);
          req.flash('error', 'Something went wrong...');
          res.redirect('/invite/' + req.params.id);
        }
        else {
          req.flash('error', 'Yay, ' + req.body.name +
                             ' has been invited!');
          res.redirect('/invite/' + req.params.id);
        }
      });
    }
  });
});

app.get('/invite/accept/:id', ensureAuthenticated, function(req, res) {
  Invite.findOne({_id: req.params.id, invited: req.user.name}, function(err, invite) {
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
  Invite.remove({_id: req.params.id, invited: req.user.name}, function(err, invite) {
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

var port = 8080;
app.listen(port);
console.info('Listening on ' + port + '. heck ya');
