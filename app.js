const createError = require('http-errors');
const express = require('express');
const path = require('path');

const indexRouter = require('./routes/index');
const app = express();


app.get('/healthcheck', (req, res) => {
  res.send({status: '200 OK'});
})

app.use('/', indexRouter);

// catch 404 and forward to error handler
app.use(function(req, res, next) {
    next(createError(404));
});

// error handler
app.use(function(err, req, res, next) {
    // set locals, only providing error in development
    res.locals.message = err.message;
    res.locals.error = req.app.get('env') === 'dev' ? err : {};

    // render the error page
    res.status(err.status || 500);
    res.status(500).json({
        error: err,
        message: err.message
    });
});

module.exports = app;