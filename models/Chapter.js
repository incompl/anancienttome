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
  console.log(this.name + ' was created. dang!');
};

var Chapter = mongoose.model('Chapter', chapterSchema);

module.exports = Chapter;