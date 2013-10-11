/* jshint node:true */

var mongoose = require('mongoose');

var storySchema = mongoose.Schema({
  title: String,
  owner: String,
  theme: String,
  read: String,
  write: String
});

storySchema.methods.onCreate = function() {
  console.log(this.name + ' was created. dang!');
};

var Story = mongoose.model('Story', storySchema);

module.exports = Story;