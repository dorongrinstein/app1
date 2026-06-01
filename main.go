package main

import (
	"log"
	"net/http"
)

const loginPage = `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="utf-8">
	<meta name="viewport" content="width=device-width, initial-scale=1">
	<title>Login</title>
	<style>
		* { box-sizing: border-box; }
		body {
			margin: 0;
			min-height: 100vh;
			display: flex;
			align-items: center;
			justify-content: center;
			font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
			background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
		}
		.card {
			background: #fff;
			padding: 2.5rem;
			border-radius: 12px;
			box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
			width: 100%;
			max-width: 360px;
		}
		h1 {
			margin: 0 0 1.5rem;
			font-size: 1.5rem;
			text-align: center;
			color: #333;
		}
		label {
			display: block;
			margin-bottom: 0.35rem;
			font-size: 0.85rem;
			color: #555;
		}
		input {
			width: 100%;
			padding: 0.65rem 0.75rem;
			margin-bottom: 1rem;
			border: 1px solid #ddd;
			border-radius: 6px;
			font-size: 1rem;
		}
		input:focus {
			outline: none;
			border-color: #667eea;
		}
		button {
			width: 100%;
			padding: 0.75rem;
			border: none;
			border-radius: 6px;
			background: #667eea;
			color: #fff;
			font-size: 1rem;
			cursor: pointer;
		}
		button:hover { background: #5566d8; }
	</style>
</head>
<body>
	<form class="card" method="post" action="/login">
		<h1>Sign in</h1>
		<label for="username">Username</label>
		<input type="text" id="username" name="username" autocomplete="username" required>
		<label for="password">Password</label>
		<input type="password" id="password" name="password" autocomplete="current-password" required>
		<button type="submit">Log in</button>
	</form>
</body>
</html>`

func loginHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Write([]byte(loginPage))
}

func main() {
	http.HandleFunc("/", loginHandler)
	log.Println("listening on :8080")
	log.Fatal(http.ListenAndServe(":8080", nil))
}
