// Anchor runs this on `anchor migrate`. Nothing to init for a stateless splitter.
const anchor = require("@coral-xyz/anchor");

module.exports = async function (provider) {
  anchor.setProvider(provider);
  // Add post-deploy setup here if ever needed.
};
