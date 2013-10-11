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

app.get('/home', ensureAuthenticated, function(req, res){
  var query = Story.find({owner: req.user.id}, function(err, stories) {
    if (err) {
      req.flash('error', 'We couldn\'t retrieve your stories. Refresh?');
      res.render('home', {stories: [], watching: []});
    }
    Watching.find({user: req.user.id}, function(err, watching) {
      if (err) {
        req.flash('error', 'We couldn\'t retrieve your watched stories. Refresh?');
        res.render('home', {stories: stories, watching: []});
      }
      res.render('home', {stories: stories, watching: watching});
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

  if (!_.contains(themes, req.body.theme)) {
    success = false;
    req.flash('error', 'Invalid theme.');
  }

  if (req.body.public !== 'true') {
    success = false;
    req.flash('error', 'Invalid privacy.');
  }

  if (success) {

    var story = new Story({
      title: req.body.title,
      owner: req.user.id,
      theme: req.body.theme,
      public: req.body.public
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
      req.flash('error', 'I\'ve never heard of that tale...');
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
      req.flash('error', 'I\'ve never heard of that tale...');
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
  Chapter.remove({story: req.params.id}, function(err) {
    if (err) {
      console.error(err);
      req.flash('info', 'Couldn\'t delete existing chapters. Weird?');
      res.redirect('/home');
      return;
    }
    Story.remove({_id: req.params.id, owner: req.user.id}, function(err) {
      if (err) {
        console.error(err);
        req.flash('info', 'Woops, it wouldn\'t die. Sorry...?');
        res.redirect('/home');
        return;
      }
      req.flash('info', 'Story deleted. Fin!');
      res.redirect('/home');
    });
  });
});

app.get('/search', ensureAuthenticated, function(req, res) {
  if (req.query.query !== undefined) {
    var q = Story.find({public: 'true'})
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
    if (err) {
      req.flash('error', 'Could not watch this story. Weird.');
    }
    else {
      var watching = results[0];
      var story = results[1];
      if (watching) {
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
          story: req.params.id,
          title: story.title,
          theme: story.theme
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

var port = 8080;
app.listen(port);
console.info('Listening on ' + port + '. heck ya');
