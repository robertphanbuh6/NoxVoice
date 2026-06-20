const loginUsername = document.getElementById("loginUsername");
const loginPassword = document.getElementById("loginPassword");
const loginBtn = document.getElementById("loginBtn");
const registerBtn = document.getElementById("registerBtn");
const loginStatus = document.getElementById("loginStatus");

async function checkAlreadyLoggedIn() {
    const res = await fetch("/api/me");
    const data = await res.json();

    if (data.loggedIn) {
        window.location.href = "/index.html";
    }
}

checkAlreadyLoggedIn();

loginBtn.onclick = async () => {

    const username = loginUsername.value.trim();
    const password = loginPassword.value.trim();

    const res = await fetch("/api/login", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            username,
            password
        })
    });

    const data = await res.json();

    loginStatus.innerText = data.message;

    if (data.success) {
        window.location.href = "/index.html";
    }
};

registerBtn.onclick = async () => {

    const username = loginUsername.value.trim();
    const password = loginPassword.value.trim();

    const res = await fetch("/api/register", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            username,
            password
        })
    });

    const data = await res.json();

    loginStatus.innerText = data.message;

    if (data.success) {
        window.location.href = "/index.html";
    }
};