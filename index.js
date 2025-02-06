const express = require('express');
const app = express();

app.get('/', root);

app.listen(8080);

function root(req, res) {
	throw new Error("hi");
	console.log('request received');
	res.send('hello my friend Julian and Julia');
}
