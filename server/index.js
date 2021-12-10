'use strict';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
require('dotenv').config();

const express = require('express');
const app = express();
let http = require('http');
let fs = require('fs');
const path = require('path');
const passport = require('passport');               // handles authentication
const expressSession = require('express-session');  // for managing session state 
const LocalStrategy = require('passport-local').Strategy; // username/password strategy
const dblast = require("./database.js");
const bcrypt = require('bcrypt');
const flash = require("connect-flash");

// session configuration
const session = {
    secret: process.env.SECRET || 'SECRET', // set this encryption key in Heroku config (never in GitHub)!
    resave: false,
    saveUninitialized: false
};

// passport configuration
const strategy = new LocalStrategy(
    async (username, password, done) => {
        if (!findUser(username)) {
            // no such user
            return done(null, false, { 'message': 'Wrong username' });
        }
        if (!validatePassword(username, password)) {
            // invalid password
            // should disable logins after N messages
            // delay return to rate-limit brute-force attacks
            await new Promise((r) => setTimeout(r, 2000)); // two second delay
            return done(null, false, { 'message': 'Wrong password' });
        }
        // success!
        // should create a user object here, associated with a unique identifier
        return done(null, username);
    });

// app configurations
app.use(express.json()); // lets you handle JSON input
app.use(express.static('client/')); // specify the directory
app.use(express.urlencoded({ 'extended': true })); // allow URLencoded data
app.use(expressSession(session));
passport.use(strategy);
app.use(passport.initialize());
app.use(passport.session());
app.use(flash());

// convert user object to a unique identifier.
passport.serializeUser((user, done) => {
    done(null, user);
});
// convert a unique identifier to a user object.
passport.deserializeUser((uid, done) => {
    done(null, uid);
});

const users = dblast.getAllUsers();

let userMap = {};

// connect HTML frontend to server backend 
app.get('/', (req, res) => {
    res.sendFile(path.resolve('./client/login.html'));
});

app.get('/profilePage', (req, res) => {
    res.sendFile(path.resolve('./client/userProfile.html'));
});

app.get('/bookingPage', (req, res) => {
    res.sendFile(path.resolve('./client/createBooking.html'));
});

app.get('/roomProfilePage', (req, res) => {
    res.sendFile(path.resolve('./client/roomProfile.html'));
});

// creating API endpoints 
app.post("/deleteUser", async (req, res) => {
    const data = req.body;
    await dblast.delUser(data.email);
});

app.post('/getRoomById', async (req, res) => {
    const data = req.body;
    res.send(JSON.stringify(await dblast.getRoomID(data.building)));
});

app.post('/editInfo', async (req, res) => {
    const data = req.body;
    await dblast.updateUserFirstName(data.firstname, data.password);
    await dblast.updateUserLastName(data.lastname, data.password);
    await dblast.updateUserEmail(data.email, data.password);
});

app.get('/deleteProfile', (req, res) => {
    console.log("deleted user profile!");
});

// Handle post data from the login.html form.
// TO DO: probably need to redirect differently
app.post('/login',
    passport.authenticate('local', {     // use username/password authentication
        'successRedirect': '/userProfile',
        'failureRedirect': '/login'      // otherwise, back to login
    }));

// browser url http://localhost:3000/login 
app.get('/login', async (req, res) => {
    const body = req.body;
    const user = await dblast.getUserByEmail({email: body.email});
    console.log(user.password);
    if (user) {
        const valid = await bcrypt.compare(body.password, user.password);
        if (valid) {
            console.log("Login Succeeded!");
            res.sendFile(path.resolve('./client/userProfile.html',
                { 'root': __dirname }));
        } else {
            res.status(400).json({ message: "Invalid password" });
        } 
    } else {
        res.status(401).json({ message: "User doesn't exist" });
    }
});

/*
app.get('/login', (req, res) => {
    console.log("Login Succeeded!");
    res.sendFile(path.resolve('./client/userProfile.html',
        { 'root': __dirname }));
});
*/

// handle logging out
app.get('/logout', (req, res) => {
    req.logout();
    res.redirect('/login');
})

// curl -d '{ "email" : "x", "password" : "X", "firstName" : "x", "lastName" : "x", "userId" : "7", "groups" : ["Esports club"], "previousBookings" : [1], "upcomingBookings" : [2]}' -H "Content-Type: application/json" http://localhost:3000/createAccount
app.post('/createAccount', async (req, res) => {
   const data = req.body;
   try {
       const hashed = await bcrypt.hash(data.password, 10);
       await dblast.addUser(
           data.firstname,
           data.lastname,
           data.email,
           hashed
       );
       console.log("Account created!");
       res.redirect('/')
    } catch {
       res.redirect('/')
    }
});

app.post('/createBooking', async (req, res) => {
    const data = req.body;
    await dblast.addBooking(data.building, data.date, data.email, data.time);
    console.log(`Created new booking successfully!`);
});

app.post('/userInfo', async (req, res) => {
    const data = req.body;
    res.send(JSON.stringify(await dblast.getUserByEmail(data.email)));
});

// https://www.codegrepper.com/code-examples/javascript/app.delete%28%29+express
app.delete('/users/:id', (req, res, next) => {
    const expressionIndex = getIndexById(req.params.id, expressions);
    if (expressionIndex !== -1) {
        expressions.splice(expressionIndex, 1);
        res.status(204).send();
    } else {
        res.status(404).send();
    }
});

// curl -d '{ "email" : "x", "password" : "X", "firstName" : "x", "lastName" : "x", "userId" : "5", "groups" : ["Esports club"], "previousBookings" : [1], "upcomingBookings" : [2]}' -H "Content-Type: application/json" http://localhost:3000/createAccount
app.post('/deleteAccount', (req, res) => {
    data["users"].pop(req.body.user);
    console.log(`Deleted account successfully!`);
});

// Gather Room Information 
app.post('/roomInformation', async (req, res) => {
    const data = req.body;
    res.send(JSON.stringify(await dblast.getRoomInformation(data.roomid)));
});

app.get('/allRooms', async (req, res) => {
    res.send(JSON.stringify(await dblast.getAllRooms()));
})

app.post('/dateInformation', async (req, res) => {
    const data = req.body;
    res.send(JSON.stringify(await dblast.getDate(data.roomid)));
});

app.post('/updateDate', async (req, res) => {
    const data = req.body;
    res.send(JSON.stringify(await dblast.updateDate(data.date, data.roomid)));
});

app.post('/bookingInformation', async (req, res) => {
    const data = req.body;
    res.send(JSON.stringify(await dblast.getBookingInformation(data.email)));
});

app.get('*', (req, res) => {
    res.send('NO FOOL, BAD COMMAND');
});

const port = 3000; // specify the port 
app.listen(process.env.PORT || port);