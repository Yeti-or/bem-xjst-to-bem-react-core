module.exports = function(fileInfo, api, options) {
  // transform `fileInfo.source` here
  // ...
  // return changed source
  console.log('^__^');
  console.log(fileInfo.path);
  fileInfo.path = 'index2.js';
  return fileInfo.source;
};
