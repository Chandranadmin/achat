/* HTML5 magic
 - GeoLocation
 - WebSpeech
 */

//WebSpeech API
var final_transcript = '';
var recognizing = false;
var last10messages = []; //to be populated later

if (!('webkitSpeechRecognition' in window)) {
    console.log("webkitSpeechRecognition is not available");
} else {
    var recognition = new webkitSpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onstart = function () {
        recognizing = true;
    };

    recognition.onresult = function (event) {
        var interim_transcript = '';
        for (var i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
                final_transcript += event.results[i][0].transcript;
                $('#msg').addClass("final");
                $('#msg').removeClass("interim");
            } else {
                interim_transcript += event.results[i][0].transcript;
                $("#msg").val(interim_transcript);
                $('#msg').addClass("interim");
                $('#msg').removeClass("final");
            }
        }
        $("#msg").val(final_transcript);
    };
}
function toggleNameForm() {
    $("#login-screen").toggle();
}

function toggleChatWindow() {
    $("#main-chat-screen").toggle();
}


$(document).ready(function () {
    //setup "global" variables first
    var socket = io.connect("127.0.0.1:3000");
    var myRoomID = null;

    $("form").submit(function (event) {
        event.preventDefault();
    });

    $("#conversation").bind("DOMSubtreeModified", function () {
        $("#conversation").animate({
            scrollTop: $("#conversation")[0].scrollHeight
        });
    });

    $("#main-chat-screen").hide();
    $("#errors").hide();
    $("#name").focus();
    $("#join").attr('disabled', 'disabled');

    if ($("#name").val() === "") {
        $("#join").attr('disabled', 'disabled');
    }

    //enter screen
    $("#nameForm").submit(function () {
        var name = $("#name").val();
        var device = "desktop";
        if (navigator.userAgent.match(/Android|BlackBerry|iPhone|iPad|iPod|Opera Mini|IEMobile/i)) {
            device = "mobile";
        }
        if (name === "" || name.length < 5) {
            $("#errors").empty();
            $("#errors").append("Please enter a name");
            $("#errors").show();
        } else {
            socket.emit("joinserver", name, device);
            toggleNameForm();
            toggleChatWindow();
            $("#msg").focus();
        }
    });
    $("#name").keypress(function (e) {
        var name = $("#name").val();
        if (name.length < 5) {
            $("#join").attr('disabled', 'disabled');
        } else {
            $("#errors").empty();
            $("#errors").hide();
            $("#join").removeAttr('disabled');
        }
    });

//main chat screen
    $("#chatForm").submit(function () {
        var msg = $("#msg").val();
        if (msg !== "") {
            socket.emit("send", msg);
            //$("#msg").val("");

        }
    });

//remove room message
    $("#message").on('click', function () {
        alert("you want Remove room the message");
        $(".messages").remove();
    });

// remove private message
    $("#privates").on('click', function () {
        alert("you want Remove room the message");
        $(".privatemessage").remove();
    });

//image upload
    $( document ).ready(function() {

        function readURL(input, target) {
            if (input.files && input.files[0]) {
                var reader = new FileReader();
                var image_target = $(target);
                reader.onload = function (e) {
                    image_target.attr('src', e.target.result).show();
                };
                reader.readAsDataURL(input.files[0]);
            }
        }

        $(".patient_pic").live("change",function(){
            readURL(this, ".preview_image")
        });

    });

//image send
    $("#chatImage").submit(function ()
    {
        var image = $(".preview_image").attr('src');
        alert(image);
        if (image !== "") {
            socket.emit("send", image);
            $(".preview_image").hide();

        }
        else
        {
            socket.emit("error");
        }
    });

//'is typing' message
    var typing = false;
    var timeout = undefined;

    function timeoutFunction() {
        typing = false;
        socket.emit("typing", false);
    }

    $("#msg").keypress(function (e) {
        if (e.which !== 13) {
            if (typing === false && myRoomID !== null && $("#msg").is(":focus")) {
                typing = true;
                socket.emit("typing", true);
            } else {
                clearTimeout(timeout);
                timeout = setTimeout(timeoutFunction, 5000);
            }
        }
    });
    socket.on("isTyping", function (data) {
        if (data.isTyping) {
            if ($("#" + data.person + "").length === 0) {
                $("#updates").append("<li id='" + data.person + "'><span class='text-success'><small>" +
                "<i class='fa fa-keyboard-o'>" + "</i> " + data.person + " is typing.</small></li>");
                timeout = setTimeout(timeoutFunction, 5000);
            }
        } else {
            $("#" + data.person + "").remove();
        }
    });
    $("#msg").keypress(function () {
        if ($("#msg").is(":focus")) {
            if (myRoomID !== null) {
                socket.emit("isTyping");
            }
        } else {
            $("#keyboard").remove();
        }
    });

    socket.on("isTyping", function (data) {
        if (data.typing) {
            if ($("#keyboard").length === 0)
                $("#updates").append("<li id='keyboard'><span class='text-muted'><i class='fa fa-keyboard-o'></i>"
                + data.person + " is typing.\n+</li>");
        } else {
            socket.emit("clearMessage");
            $("#keyboard").remove();
        }
        console.log(data);
    });

    $("#showCreateRoom").click(function () {
        $("#createRoomForm").toggle();
    });

    $("#createRoomBtn").click(function () {
        var roomExists = false;
        var roomName = $("#createRoomName").val();
        socket.emit("check", roomName, function (data) {
            roomExists = data.result;
            if (roomExists) {
                $("#errors").empty();
                $("#errors").show();
                $("#errors").append("Room <i>" + roomName + "</i> already exists");
            } else {
                if (roomName.length > 0) { //also check for roomname
                    socket.emit("createRoom", roomName);
                    $("#errors").empty();
                    $("#errors").hide();
                }
            }
        });
    });

    $("#updateRoomBtn").click(function () {

        var updateName = roomName.replace("#createRoomName");
        socket.emit("check", roomName, function (data) {
            roomExists = data.result;
            {
                if (roomName.length > 0) { //also check for roomname
                    socket.emit("updateRoom", newroomName);
                    $("#errors").empty();
                    $("#errors").hide();
                }
            }
        });
    });

    $("#rooms").on('click', '.joinRoomBtn', function () {
        var roomName = $(this).siblings("span").text();
        var roomID = $(this).attr("id");
        socket.emit("joinRoom", roomID);
    });

    $("#rooms").on('click', '.removeRoomBtn', function () {
        var roomName = $(this).siblings("span").text();
        var roomID = $(this).attr("id");
        socket.emit("removeRoom", roomID);
        $("#createRoom").show();
    });

    $("#leave").click(function () {
        var roomID = myRoomID;
        socket.emit("leaveRoom", roomID);
        $("#createRoom").show();
    });

    $("#people").on('click', '.whisper', function () {
        var name = $(this).siblings("span").text();
        $("#msg").val("w:" + name + ":");
        $("#msg").focus();
    });

//socket-y stuff

    socket.on("exists", function (data) {
        $("#errors").empty();
        $("#errors").show();
        $("#errors").append(data.msg + " Try <strong>" + data.proposedName + "</strong>");
        toggleNameForm();
        toggleChatWindow();
    });

    socket.on("joined", function () {
        $("#errors").hide();
        if (navigator.geolocation) { //get lat lon of user
            navigator.geolocation.getCurrentPosition(positionSuccess, positionError, {enableHighAccuracy: true});
        } else {
            $("#errors").show();
            $("#errors").append("Your browser is ancient and it doesn't support GeoLocation.");
        }
        function positionError(e) {
            console.log(e);
        }

        function positionSuccess(position) {
            var lat = position.coords.latitude;
            var lon = position.coords.longitude;
            //consult the yahoo service
            $.ajax({
                type: "GET",
                url: "http://query.yahooapis.com/v1/public/yql?q=select%20*%20from%20geo.placefinder%20where%20text%3D%22"
                + lat + "%2C" + lon + "%22%20and%20gflags%3D%22R%22&format=json",
                dataType: "json",
                success: function (data) {
                    socket.emit("countryUpdate", {country: data.query.results.Result.countrycode});
                }
            });
        }
    });

    socket.on("update", function (msg) {
        $("#msgs").append("<strong><center><li>" + msg + "</li>");
    });

    socket.on("update-people", function (data) {
        //var peopleOnline = [];
        $("#people").empty();
        $('#people').append("<strong><li class=\"list-group-item active\">People online</strong><span class=\"badge\">"
        + data.count + "</span></li>");
        $.each(data.people, function (a, obj) {
            if (!("country" in obj)) {
                html = "";
            } else {
                html = ("<img class=\"flag flag-" + obj.country + "\"/>");
            }
            $('#people').append("<small><b></b><li class=\"list-group-item private\"><span>" + obj.name + "</span> " +
            "<i class=\"fa fa-" + obj.device + "\"></i> " + html + " <a href=\"#\" class=\"whisper btn btn-xs\">whisper</a></li>");
            //peopleOnline.push(obj.name);
        });
    });

    //messages send format


    socket.on("chats", function(person, msg) {
        $("#message").append("<div class='messages'><strong><span class='text-success'>" + person.name
        + "</span></strong><li class='add'> " + msg + " </li>" + "<small>" + "<i>" + (new Date().toString("h:mm tt")) + "<br>" + "</div>");
        //clear typing field
        $("#" + person.name + "").remove();
        clearTimeout(timeout);
        timeout = setTimeout(timeoutFunction, 0);
    });




    //
    //socket.on("chats", function (person, msg) {
    //
    //    $("#message").append("<div class='messages'><strong><span class='text-success'>" + person.name
    //    + "</span></strong><li class='add'> " + msg + " </li>" + "<small>" + "<i>" + (new Date().toString("h:mm tt")) + "<br>" + "</div>");
    //
    //   // clear typing field
    //    $("#" + person.name + "").remove();
    //    clearTimeout(timeout);
    //    timeout = setTimeout(timeoutFunction, 0);
    //});


    socket.on("chats", function (person, images) {
        $("#images").append("<div class='img'><strong><span class='text-success'>" + person.name
        + "</span></strong>" +
        "<li><img src=" +images + "></li>"+"<small>" + "<i>" + (new Date().toString("h:mm tt")) + "<br>" + "</div>");

        //clear typing field
        $("#" + person.name + "").remove();
        clearTimeout(timeout);
        timeout = setTimeout(timeoutFunction, 0);
    });

    // files send format

    socket.on("chat", function (person, file) {
        $("#uploadFile").append("<li><input type='file' name='dataFile'>" + person.name + +"</li>");
    });
    socket.on("uploadFile", function (person, msg) {
        if (person.name === "You") {
            s = "uploadFile"
        } else {e
            s = "uploadFile"
        }
        $("#msgs").append("<li><strong><span class='text-muted'>" + person.name + "</span></strong> " + s + ": " + msg + "</li>");
    });


    //private conversations
    socket.on("whisper", function (person, msg) {
        if (person.name === "You") {
            s = "whisper"
        } else {
            s = "whispers"
        }
        $("#msgs").append("<strong><span class='text-muted'>" + person.name + "</span></strong>" +
        " <li class='private'> " + msg + "</li>" + "<small>" + "<i>" + (new Date().toString("h:mm tt")));
        $("#")
    });

    //Room Functions
    socket.on("roomList", function (data) {
        $("#rooms").text("");
        $("#rooms").append("<strong><li class=\"list-group-item active\" style='color: green'>List of Assistance <span class=\"badge\">" + data.count + "</span></li>");
        if (!jQuery.isEmptyObject(data.rooms)) {
            $.each(data.rooms, function (id, room) {
                var html = "<button id=" + id + " class='joinRoomBtn btn btn-success btn-xs' >Join</button>" + " " + "<button id=" + id + " class='removeRoomBtn btn btn-warning btn-xs'>Remove</button>";
                $('#rooms').append("<li id=" + id + " class=\"list-group-item\"><span>" + room.name + "</span> " + html + "</li>");
            });
        } else {
            $("#rooms").append("<storng><b><li class=\"list-group-item\" style='color: orange'>There are no assistance yet</b></li>");
        }
    });

    socket.on("sendRoomID", function (data) {
        myRoomID = data.id;
    });

    // logout
    $(document).ready(function () {
        $('.form-logout').on('click', function () {

            if (currentUser) {
                var currentUser = Parse.User.current();
                Parse.User.logout();
                alert("Are you sure remove the page");
                window.location = "index.html";
            } else {
                window.location = "index.html";
            }
        });
    });

    //local storage
    if (localStorage) {

        // Add an event listener for form submissions
        document.getElementById('chatForm').addEventListener('submit', function () {
            // Get the value of the name field.
            var name = document.getElementById('name').value;

            // Save the name in localStorage.
            localStorage.setItem('name', name);
        });

    }
    window.onload = function () {

        // Retrieve the users name.
        var name = localStorage.getItem('name');

        if (name != "undefined" || name != "null") {
            if( document.getElementById('welcomeMessage')){
                document.getElementById('welcomeMessage').innerHTML = "Hello " + name + "!";
            }
        } else
            document.getElementById('welcomeMessage').innerHTML = "Hello!";
    };

//disconnect
    socket.on("disconnect", function () {
        $("#msgs").append("<li><strong><center><span class='text-danger'>you have logout the page</span></strong></li>");
        $("#msg").attr("disabled", "disabled");
        $("#send").attr("disabled", "disabled");
    });
});
