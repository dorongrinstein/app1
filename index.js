const express = require('express');
const app = express();

app.get('/', root);

app.listen(8080);

function root(req, res) {
	console.log('request received');
	res.send('hello');
}
