const fs = require('fs');
let c = fs.readFileSync('server.js', 'utf8');

// Remove all bad route lines
const lines = c.split('\n');
const cleaned = lines.filter(line => {
  return !line.includes("app.use('/user1'") &&
         !line.includes("app.use('/user2'") &&
         !line.includes("app.use(\"/user2\"") &&
         !line.includes("app.get('/user1'") &&
         !line.includes("app.get('/user2'") &&
         !line.includes("res.sendFile") &&
         !line.includes("res.redirect('/user1')");
});

// Add correct routes before error handler
const correct = `
app.use('/uploads', express.static(path.join(__dirname, './uploads')));
app.get('/user1', (req, res) => res.sendFile(path.resolve(__dirname, '../fronted/user1.html')));
app.get('/user2', (req, res) => res.sendFile(path.resolve(__dirname, '../fronted/user2.html')));
app.get('/', (req, res) => res.redirect('/user1'));
`;

const result = cleaned.join('\n').replace("app.use('/uploads'", correct + "\n//placeholder");
fs.writeFileSync('server.js', result);
console.log('Fixed!');