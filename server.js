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
    res.locals.flash = req.flash('info');
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
  res.render('home');
});

app.get('/account', ensureAuthenticated, function(req, res){
  res.render('account');
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
  req.flash('info', 'A new story has begun... created "' +
                    req.body.title + '"');
  res.redirect('/home');
});

var port = 8080;
app.listen(port);
console.info('Listening on ' + port + '. heck ya');
