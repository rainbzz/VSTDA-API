const server = require('./app');

const PORT = 8484;

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
