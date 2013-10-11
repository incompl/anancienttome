/* jshint node:true */

var mongoose = require('mongoose');

var watchingSchema = mongoose.Schema({
  user: String,
  story: String,
  title: String,
  theme: String
});

var Watching = mongoose.model('Watching', watchingSchema);

module.exports = Watching;