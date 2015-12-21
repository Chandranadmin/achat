var express = require('express'),
    app = express(),
    server = require('http').createServer(app),
    io = require("socket.io").listen(server),
    uuid = require('node-uuid'),
    Room = require('./room.js'),
    _ = require('underscore')._,
    mongo = require('mongodb').MongoClient,
    cookie = require('cookie'),
    store  = new express.session.MemoryStore;

app.use(express.cookieParser('chat'));
var parseCookie =  app.use(express.session({
    secret: 'chat',
    store: store
}));

app.configure(function() {
    app.set('port', process.env.OPENSHIFT_NODEJS_PORT || 3000);
    app.set('ipaddr', process.env.OPENSHIFT_NODEJS_IP || "127.0.0.1");
    app.use(express.bodyParser());
    app.use(express.methodOverride());
    app.use(express.static(__dirname + '/public'));
    app.use('/components', express.static(__dirname + '/components'));
    app.use('/js', express.static(__dirname + '/js'));
    app.use('/icons', express.static(__dirname + '/icons'));
    app.set('views', __dirname + '/views');
    app.engine('html', require('ejs').renderFile);
});

/*
 io.set('authorization', function(handshake, callback) {
 if (handshake.headers.cookie) {
 // pass a req, res, and next as if it were middleware
 parseCookie(handshake, null, function(err) {
 handshake.sessionID = handshake.signedCookies['connect.sid'];
 // or if you don't have signed cookies
 handshake.sessionID = handshake.cookies['connect.sid'];

 store.get(handshake.sessionID, function (err, session) {
 if (err || !session) {
 // if we cannot grab a session, turn down the connection
 callback('Session not found.', false);
 } else {
 // save the session data and accept the connection
 handshake.session = session;
 callback(null, true);
 }
 });
 });
 } else {
 return callback('No session.', false);
 }
 callback(null, true);
 });*/

app.get('/', function(req, res) {
    // req.session.property = 'a value';
    res.render('index.html');
});

/*
 io.set('authorization', function (data, accept) {
 if (!data.headers.cookie)
 return accept('No cookie transmitted.', false);

 data.cookie = parseCookie(data.headers.cookie);
 data.sessionID = data.cookie['express.sid'];

 store.load(data.sessionID, function (err, session) {
 if (err || !session) return accept('Error', false);

 data.session = session;
 return accept(null, true);
 });
 });*/


server.listen(app.get('port'), app.get('ipaddr'), function() {
    console.log('Express server listening on  IP: ' + app.get('ipaddr') + ' and port ' + app.get('port'));
});

io.set("log level", 1);
var people = {};
var rooms = {};
var sockets = [];
var chatHistory = {};

function purge(s, action) {
    /*
     The action will determine how we deal with the room/user removal.
     These are the following scenarios:
     if the user is the owner and (s)he:
     1) disconnects (i.e. leaves the whole server)
     - advise users
     - delete user from people object
     - delete room from rooms object
     - delete chat history
     - remove all users from room that is owned by disconnecting user
     2) removes the room
     - same as above except except not removing user from the people object
     3) leaves the room
     - same as above
     if the user is not an owner and (s)he's in a room:
     1) disconnects
     - delete user from people object
     - remove user from room.people object
     2) removes the room
     - produce error message (only owners can remove rooms)
     3) leaves the room
     - same as point 1 except not removing user from the people object
     if the user is not an owner and not in a room:
     1) disconnects
     - same as above except not removing user from room.people object
     2) removes the room
     - produce error message (only owners can remove rooms)
     3) leaves the room
     - n/a
     */
    if (people[s.id].inroom) { //user is in a room
        var room = rooms[people[s.id].inroom]; //check which room user is in.
        console.log(room);
        if (s.id === room.owner) { //user in room and owns room
            if (action === "disconnect") {
                io.sockets.in(s.room).emit("update", "The owner (" + people[s.id].name + ") has left the server. " +
                    "The room is removed and you have been disconnected from it as well.");
                var socketids = [];
                for (var i = 0; i < sockets.length; i++) {
                    socketids.push(sockets[i].id);
                    if (_.contains((socketids)), room.people) {
                        sockets[i].leave(room.name);
                    }
                }
                if (_.contains((room.people)), s.id) {
                    for (var i = 0; i < room.people.length; i++) {
                        people[room.people[i]].inroom = null;
                    }
                }
                room.people = _.without(room.people, s.id); //remove people from the room:people{}collection
                delete rooms[people[s.id].owns]; //delete the room
                delete people[s.id]; //delete user from people collection
                sizePeople = _.size(people);
                sizeRooms = _.size(rooms);
                io.sockets.emit("update-people", {
                    people: people,
                    count: sizePeople
                });
                io.sockets.emit("roomList", {
                    rooms: rooms,
                    count: sizeRooms
                });
                var o = _.findWhere(sockets, {
                    'id': s.id
                });
                sockets = _.without(sockets, o);
            } else if (action === "removeRoom") { //room owner removes room
                io.sockets.in(s.room).emit("update", "The owner (" + people[s.id].name + ") has removed the room. The room is removed and you have been disconnected from it as well.");
                var socketids = [];
                for (var i = 0; i < sockets.length; i++) {
                    socketids.push(sockets[i].id);
                    if (_.contains((socketids)), room.people) {
                        sockets[i].leave(room.name);
                    }
                }

                if (_.contains((room.people)), s.id) {
                    for (var i = 0; i < room.people.length; i++) {
                        people[room.people[i]].inroom = null;
                    }
                }
                delete rooms[people[s.id].owns];
                people[s.id].owns = null;
                room.people = _.without(room.people, s.id); //remove people from the room:people{}collection
                delete chatHistory[room.name]; //delete the chat history
                sizeRooms = _.size(rooms);
                io.sockets.emit("roomList", {
                    rooms: rooms,
                    count: sizeRooms
                });
            } else if (action === "leaveRoom") { //room owner leaves room
                io.sockets.in(s.room).emit("update", "The owner (" + people[s.id].name + ") has left the room. The room is removed and you have been disconnected from it as well.");
                var socketids = [];
                for (var i = 0; i < sockets.length; i++) {
                    socketids.push(sockets[i].id);
                    if (_.contains((socketids)), room.people) {
                        sockets[i].leave(room.name);
                        delete chatHistory[room.name];
                    }
                }

                if (_.contains((room.people)), s.id) {
                    for (var i = 0; i < room.people.length; i++) {
                        people[room.people[i]].inroom = null;
                    }
                }
                delete rooms[people[s.id].owns];
                people[s.id].owns = null;
                room.people = _.without(room.people, s.id); //remove people from the room:people{}collection
                delete chatHistory[room.name]; //delete the chat history
                sizeRooms = _.size(rooms);
                io.sockets.emit("roomList", {
                    rooms: rooms,
                    count: sizeRooms
                });

            }
            else if (action === "logout") { //room owner leaves room
                io.sockets.in(s.room).emit("update", "The owner (" + people[s.id].name + ") has logout the room. ");
                var socketids = [];
                people[s.id].owns = null;
                sizeRooms = _.size(rooms);
                io.sockets.emit("roomList", {
                    rooms: rooms,
                    count: sizeRooms
                });

            }
        }

        else { //user in room but does not own room
            if (action === "disconnect") {
                io.sockets.emit("update", people[s.id].name + " has disconnected from the server.");
                if (_.contains((room.people), s.id)) {
                    var personIndex = room.people.indexOf(s.id);
                    room.people.splice(personIndex, 1);
                    s.leave(room.name);
                }
                delete people[s.id];
                sizePeople = _.size(people);
                io.sockets.emit("update-people", {
                    people: people,
                    count: sizePeople
                });
                var o = _.findWhere(sockets, {
                    'id': s.id
                });
                sockets = _.without(sockets, o);
            } else if (action === "removeRoom") {
                s.emit("update", "Only the owner can remove a room.");
            } else if (action === "leaveRoom") {
                if (_.contains((room.people), s.id)) {
                    var personIndex = room.people.indexOf(s.id);
                    room.people.splice(personIndex, 1);
                    people[s.id].inroom = null;
                    io.sockets.emit("update", people[s.id].name + " has left the room.");
                    s.leave(room.name);
                }

                else if (action === "logout") { //user logout the applications
                    io.sockets.in(s.room).emit("update", "The owner (" + people[s.id].name + ") has logout the room. ");
                    var socketids = [];
                    people[s.id].owns = null;
                    sizeRooms = _.size(rooms);
                    io.sockets.emit("roomList", {
                        rooms: rooms,
                        count: sizeRooms
                    });

                }
            }
        }
    } else {
        //The user isn't in a room, but maybe he just disconnected, handle the scenario:
        if (action === "disconnect") {
            io.sockets.emit("update", people[s.id].name + " has disconnected from the server.");
            delete people[s.id];
            sizePeople = _.size(people);
            io.sockets.emit("update-people", {
                people: people,
                count: sizePeople
            });
            var add = _.findWhere(sockets, {
                'id': s.id
            });
            sockets = _.without(sockets, add);
        }
    }
    //the user isn't in a room,but maybe he just logout, handle the scenario:
    if (action === "logout") {
        io.sockets.emit("update", people[s.id].name + " has logout to server.");

        io.sockets.emit("update-people", {
            people: people,
            count: sizePeople
        });
        var add = _.findWhere(sockets, {
            'id': s.id
        });
        sockets = _.without(sockets, add);
    }


}

function peopleFn(name,datetime,onlydate,ownerRoomID,inRoomID,device,s_id){
    this.name = name;
    this.datetime = datetime;
    this.onlydate = onlydate;
    this.ownerRoomID = ownerRoomID;
    this.inRoomID = inRoomID;
    this.device = device;
    this.s_id = s_id;
}
function msgInsertFn(name,msg,datetime){
    this.name = name;
    this.datetime = datetime;
    this.msg = msg;
}
function getCurrentDateTime(_t){
    var d = new Date(),month = d.getMonth()+1,day = d.getDate(),output,time,_t;
    var page = (typeof _t != 'undefined')?_t:'';
    time = d.getHours() + ":" + d.getMinutes() + ":" + d.getSeconds();
    output = d.getFullYear() + '/' +
        (month<10 ? '0' : '') + month + '/' +
        (day<10 ? '0' : '') + day;
    if(_t)
        output = output +' '+time;
    return output;
}
mongo.connect('mongodb://127.0.0.1/achat', function(err, db) {
    if(err) throw err;
    console.log('DB connection worked!!!');
    io.sockets.on("connection", function(socket) {
        // var session = socket.handshake.session;
        // console.log(session.property);

        var get_people_col = db.collection('peoples');
        var col = db.collection('messages');
        //get collection for all people list
        //Emit all people to client
        /* get_people_col.find().limit(10).sort('datetime : -1').toArray(function(err,res){
         if(err) throw err;
         console.log(res);
         socket.emit('output_people',res);
         _total_peoples = res.length;
         console.log(_total_peoples);
         });*/
        socket.on("joinserver", function(name, device) {
            var exists = false;
            var ownerRoomID = inRoomID = null;

            _.find(people, function(key, value) {
                if (key.name.toLowerCase() === name.toLowerCase())
                    return exists = true;
            });
            if (exists) { //provide unique username:
                var randomNumber = Math.floor(Math.random() * 1001)
                do {
                    proposedName = name + randomNumber;
                    _.find(people, function(key, value) {
                        if (key.name.toLowerCase() === proposedName.toLowerCase())
                            return exists = true;
                    });
                } while (!exists);
                socket.emit("exists", {
                    msg: "The username already exists, please pick another one.",
                    proposedName: proposedName
                });
            } else {
                people[socket.id] = {
                    "name": name,
                    "owns": ownerRoomID,
                    "inroom": inRoomID,
                    "device": device
                };
                console.log(people[socket.id]);
                var d = new Date();
                var days = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

                socket.emit("update", "You have connected to the server."+ "<br>" + days[d.getDay()]);
                io.sockets.emit("update", people[socket.id].name + " is online.");
                sizePeople = _.size(people);
                sizeRooms = _.size(rooms);
                io.sockets.emit("update-people", {
                    people: people,
                    count: sizePeople
                });
                socket.emit("roomList", {
                    rooms: rooms,
                    count: sizeRooms
                });
                socket.emit("joined"); //extra emit for GeoLocation
                sockets.push(socket);
                //insert people data to DB
                var _current_date_time = getCurrentDateTime(1);
                var _current_date_only = getCurrentDateTime();
                var _people = new peopleFn(name,_current_date_time,_current_date_only,ownerRoomID,inRoomID,device,socket.id);
                //console.log(_people);
                get_people_col.insert(_people,function(err,savedPeople){
                    if(err || !savedPeople)console.log("People "+_people.name+" not saved :( "+ err);
                    else console.log("People - "+_people.name+"  saved on "+" :) ");
                })
            }
        });

        socket.on("getOnlinePeople", function(fn) {
            fn({
                people: people
            });
        });

        socket.on("countryUpdate", function(data) { //we know which country the user is from
            country = data.country.toLowerCase();
            people[socket.id].country = country;
            io.sockets.emit("update-people", {
                people: people,
                count: sizePeople
            });
        });

        socket.on("countryUpdate", function(data) {
            country = data.country.toLowerCase();
            people[socket.id].country = country;
            io.sockets.emit("update-people", {people: people, count: sizePeople});
        });


        socket.on("typing", function(data) {
            if (typeof people[socket.id] !== "undefined")
                io.sockets. in (socket.room).emit("isTyping", {
                    isTyping: data,
                    person: people[socket.id].name
                });
        });

        socket.on("send", function(msg) {
            //process.exit(1);
            var re = /^[w]:.*:/;
            var whisper = re.test(msg);
            var whisperStr = msg.split(":");
            var found = false;
            if (whisper) {
                var whisperTo = whisperStr[1];
                var keys = Object.keys(people);
                if (keys.length != 0) {
                    for (var i = 0; i < keys.length; i++) {
                        if (people[keys[i]].name === whisperTo) {
                            var whisperId = keys[i];
                            found = true;
                            if (socket.id === whisperId) { //can't whisper to ourselves
                                socket.emit("update", "You can't whisper to yourself.");
                            }
                            break;
                        }
                    }
                }
                if (found && socket.id !== whisperId) {
                    var whisperTo = whisperStr[1];
                    var whisperMsg = whisperStr[2];
                    socket.emit("whisper", {
                        name: "You"
                    }, whisperMsg);
                    io.sockets.socket(whisperId).emit("whisper", people[socket.id], whisperMsg);
                    console.log(people[socket.id].name+'-'+whisperMsg);
                    var _msg = new msgInsertFn(people[socket.id].name,whisperMsg);
                    col.insert(_msg,function(err,savedMsg){
                        if(err || !savedMsg)console.log("Name "+_msg.name+" not saved :( "+ err);
                        else console.log("Name - "+_msg.name+"  saved msg "+ _msg.msg +" :) ");
                    });
                } else {
                    socket.emit("update", "Can't find " + whisperTo);
                }
            } else {
                if (io.sockets.manager.roomClients[socket.id]['/' + socket.room] !== undefined) {
                    io.sockets. in (socket.room).emit("chats", people[socket.id], msg);
                    console.log(people[socket.id].name+'-'+msg);
                    //console.log(people[socket.id].name+'-'+image);
                    var _msg = new msgInsertFn(people[socket.id].name,msg);
                    col.insert(_msg,function(err,savedMsg){
                        if(err || !savedMsg)console.log("Name "+_msg.name+" not saved :( "+ err);
                        else console.log("Name - "+_msg.name+"  saved msg "+ _msg.msg +" :) ");
                    });
                    socket.emit("isTyping", false);
                    if (_.size(chatHistory[socket.room]) > 10) {
                        chatHistory[socket.room].splice(0, 1);
                    } else {
                        chatHistory[socket.room].push(people[socket.id].name + msg);
                    }
                } else {
                    socket.emit("update", "Please connect to a room.");
                }


            }
        });

        socket.on("disconnect", function() {
            if (typeof people[socket.id] !== "undefined") { //this handles the refresh of the name screen
                purge(socket, "disconnect");
            }
        });

        //Room functions
        socket.on("createRoom", function(name) {

            if (people[socket.id].inroom) {
                socket.emit("update", "You are in a room. Please leave it first to create your own.");
            } else if (!people[socket.id].owns) {
                //console.log("under create room");
                var id = uuid.v4();
                //console.log(id);
                var room = new Room(name, id, socket.id);
                //console.log(room);
                rooms[id] = room;
                //console.log(rooms[id]);
                sizeRooms = _.size(rooms);
                io.sockets.emit("roomList", {
                    rooms: rooms,
                    count: sizeRooms
                });
                //add room to socket, and auto join the creator of the room
                socket.room = name;
                socket.join(socket.room);
                people[socket.id].owns = id;
                people[socket.id].inroom = id;
                room.addPerson(socket.id);
                socket.emit("update", "Welcome to " + room.name);
                socket.emit("sendRoomID", {
                    id: id
                });
                chatHistory[socket.room] = [];
            } else {
                socket.emit("update", "You have already created a room.");
            }
        });

        socket.on("check", function(name, fn) {
            var match = false;
            _.find(rooms, function(key, value) {
                if (key.name === name)
                    return match = true;
            });
            fn({
                result: match
            });
        });

        socket.on("removeRoom", function(id) {
            var room = rooms[id];
            if (socket.id === room.owner) {
                purge(socket, "removeRoom");
            } else {
                socket.emit("update", "Only the owner can remove a room.");
            }
        });

        socket.on("joinRoom", function(id) {
            if (typeof people[socket.id] !== "undefined") {
                var room = rooms[id];
                console.log(room);
                if (socket.id === room.owner) {
                    socket.emit("update", "You are the owner of this room and you have already been joined.");
                } else {
                    if (_.contains((room.people), socket.id)) {
                        socket.emit("update", "You have already joined this room.");
                    } else {
                        if (people[socket.id].inroom !== null) {
                            socket.emit("update", "You are already in a room (" + rooms[people[socket.id].inroom].name + "), please leave it first to join another room.");
                        } else {
                            room.addPerson(socket.id);
                            people[socket.id].inroom = id;
                            socket.room = room.name;
                            socket.join(socket.room);
                            user = people[socket.id];
                            io.sockets. in (socket.room).emit("update", user.name + " has connected to " + room.name + " room.");
                            socket.emit("update", "Welcome to " + room.name + ".");
                            socket.emit("sendRoomID", {
                                id: id
                            });
                            var keys = _.keys(chatHistory);
                            if (_.contains(keys, socket.room)) {
                                socket.emit("history", chatHistory[socket.room]);
                            }
                        }
                    }
                }
            } else {
                socket.emit("update", "Please enter a valid name first.");
            }
        });

        socket.on("leaveRoom", function(id) {
            var room = rooms[id];
            if (room)
                purge(socket, "leaveRoom");
        });
    });
});
