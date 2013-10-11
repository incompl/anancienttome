/* jshint node:true */

var mongoose = require('mongoose');

var inviteSchema = mongoose.Schema({
  inviter: String,
  invited: String,
  story: String,
  title: String,
  theme: String,
  write: String,
  from: String,
  accepted: Boolean
});

var Invite = mongoose.model('Invite', inviteSchema);

module.exports = Invite;