/* jshint node:true */

var mongoose = require('mongoose');

var userSchema = mongoose.Schema({
  id: String,
  name: String,
  twitterConsumerKey: String,
  twitterConsumerSecret: String,
  influence: Object
});

userSchema.methods.onCreate = function() {
  console.log(this.name + ' was created. dang!');
};

var User = mongoose.model('User', userSchema);

module.exports = User;