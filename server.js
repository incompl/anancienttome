/* jshint node:true */

// My stuff
var keys = require('./keys.js');

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
  res.redirect('/');
}

app.get('/', function(req, res){
  res.render('index');
});

app.get('/home', ensureAuthenticated, function(req, res){
  Story.find({
    owner: req.user.id
  }, function(err, stories) {
    if (err) {
      req.flash('error', 'We couldn\'t retrieve your stories. Try again?');
    }
    res.render('home', {stories: stories});
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
  res.render('new');
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

  if (req.body.theme !== 'Medieval Fantasy') {
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
      }
      newStory.onCreate();
      req.flash('info', 'A new story has begun... created "' +
                      req.body.title + '"');
      res.redirect('/home');
    });

  }
  else {
    res.redirect('/new');
  }
});

app.get('/delete/:id', ensureAuthenticated, function(req, res) {
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

var port = 8080;
app.listen(port);
console.info('Listening on ' + port + '. heck ya');
