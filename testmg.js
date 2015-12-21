var mongo = require('mongodb');
function peopleFn(name){
    this.name = name;
}
mongo.connect('mongodb://127.0.0.1/chatapp', function(err, db) {
    if(err) throw err;
    console.log('DB connection worked!!!');
    var _people = new peopleFn('Dinesh');
     var collection = db.collection('peoples');
     collection.insert(_people,function(err,savedPeople){
        if(err || !savedPeople)console.log("People "+_people.name+" not saved :( "+ err);
        else console.log("People "+_people.name+"  saved :) ");

    })
});