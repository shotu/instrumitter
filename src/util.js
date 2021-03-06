var path = require('path')
var timeMs = require('time-ms')

var wrapFn = exports.wrapFn = function(fn, options, instrumitter) {
    var wrappedFn = function() {
        var data = {
            this:this,
            arguments:Array.from(arguments)
        }

        handleInvokeEvent(data, options, instrumitter)
        handleCallbackEvent(data, options, instrumitter)

        var args = data.arguments
        var before = timeMs()
        try {
            var result = fn.apply(this, args)
            var after = timeMs()
            handleReturnEvent(data, options, instrumitter, result, before, after)
        } catch(error) {
            var after = timeMs()
            handleReturnEventError(data, options, instrumitter, error, before, after)
            throw error
        }
        handlePromiseEvent(data, options, instrumitter)

        return result
    }

    copyFnProperties(wrappedFn, fn)

    return wrappedFn
}

var handleInvokeEvent = exports.handleInvokeEvent = function(data, options, instrumitter) {
    if(options.stack) {
        data.stack = getCallStack(2)
    }

    if(options.invoke) {
        instrumitter.emit(options.fn+':invoke', data)
    }
}

var handleReturnEvent = exports.handleReturnEvent = function(data, options, instrumitter, result, before, after) {
    data.time = before
    data.return = { value:result, time:after }
    data.return.elapsed = data.return.time - data.time

    if(options.return) {
        instrumitter.emit(options.fn+':return', data)
    }
}

var handleReturnEventError = exports.handleReturnEventError = function(data, options, instrumitter, error, before, after) {
    data.time = before
    data.return = { error, time:after }
    data.return.elapsed = data.return.time - data.time

    if(options.return) {
        instrumitter.emit(options.fn+':return', data)
    }
}

var handleCallbackEvent = exports.handleCallbackEvent = function(data, options, instrumitter) {
    var args = data.arguments
    var callback = args[args.length-1]

    if(options.callback && options.forceCallback && !isFunction(callback)) {
        callback = function(){}
        args.push(callback)
    }

    if(options.callback && isFunction(callback)) {
        args[args.length-1] = function() {
            var time = timeMs()
            data.callback = {
                this:this,
                arguments:Array.from(arguments),
                error:arguments[0],
                value:arguments[1],
                time,
                elapsed:time - data.time
            }
            instrumitter.emit(options.fn+':callback', data)
            callback.apply(this, arguments)
        }
    }
}

var handlePromiseEvent = exports.handlePromiseEvent = function(data, options, instrumitter) {
    var result = data.return.value

    if(isPromise(result) && options.promise) {
        result.then(function(value) {
            var time = timeMs()
            data.promise = {
                time,
                value,
                elapsed:time - data.time
            }
            instrumitter.emit(options.fn+':promise', data)
        }).catch(function(error) {
            var time = timeMs()
            data.promise = {
                time,
                error,
                elapsed:time - data.time
            }
            instrumitter.emit(options.fn+':promise', data)
        })
    }
}

var isPromise = exports.isPromise = function(promise) {
    return promise
        && promise.then instanceof Function
        && promise.catch instanceof Function
}

var isFunction = exports.isFunction = function(fn) {
    return fn instanceof Function
}

var getCallerDirName = exports.getCallerDirName = function() {
    var origPrepareStackTrace = Error.prepareStackTrace
    Error.prepareStackTrace =  (_, stack) => stack
    var stack = (new Error).stack
    Error.prepareStackTrace = origPrepareStackTrace
    return path.dirname(stack[2].getFileName())
}

var getCallStack = exports.getCallStack = function(levelsAbove) {
    var origPrepareStackTrace = Error.prepareStackTrace
    Error.prepareStackTrace = (_, stack) => stack
    var stack = (new Error).stack
    Error.prepareStackTrace = origPrepareStackTrace
    return stack.slice((levelsAbove||0)+1).map(callsite => {
        return {
            name:callsite.getFunctionName(),
            file:callsite.getFileName(),
            line:callsite.getLineNumber(),
            char:callsite.getColumnNumber()
        }
    })
}

var copyFnProperties = exports.copyFnProperties = function(target, source) {
    Object.defineProperties(target, {
        name: { value:source.name },
        length: { value:source.length }
    })

    Object.keys(source).forEach(key => {
        target[key] = source[key]
    })
}