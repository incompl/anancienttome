/* jshint node:true */

var mongoose = require('mongoose');

var chapterSchema = mongoose.Schema({
  story: String,
  author: String,
  authorName: String,
  created: Date,
  text: String
});

chapterSchema.methods.onCreate = function() {
  console.log('a new chapter of ' + this.story +
              ' has been written by ' + this.authorName);
};

var Chapter = mongoose.model('Chapter', chapterSchema);

module.exports = Chapter;