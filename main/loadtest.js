const fs = require('fs');
const Influx = require('influx');
const constants = require('./constants.js');
const exec = require('child_process').exec;
const request = require('request');

const tags = ['test', 'provider', 'language', 'memory'];

const influx = new Influx.InfluxDB({
    host: 'localhost',
    port: 8086,
    database: 'results',
    username: 'benchmark-suite',
    password: 'benchmark',
    schema: [
        {
            measurement: constants.LATENCY+'_benchmark',
            fields: {
                duration: Influx.FieldType.INTEGER,
                latency_avg: Influx.FieldType.FLOAT,
                latency_stdev: Influx.FieldType.FLOAT,
                latency_max: Influx.FieldType.FLOAT,
                total_count: Influx.FieldType.INTEGER,
                rps_theoretic: Influx.FieldType.INTEGER,
                rps_avg: Influx.FieldType.FLOAT,
                percentile_50: Influx.FieldType.FLOAT,
                percentile_95: Influx.FieldType.FLOAT,
                percentile_99: Influx.FieldType.FLOAT,
                error: Influx.FieldType.INTEGER,
                n: Influx.FieldType.INTEGER
            },
            tags: tags
        },
        {
            measurement: constants.FACTORS+'_benchmark',
            fields: {
                duration: Influx.FieldType.INTEGER,
                latency_avg: Influx.FieldType.FLOAT,
                latency_stdev: Influx.FieldType.FLOAT,
                latency_max: Influx.FieldType.FLOAT,
                total_count: Influx.FieldType.INTEGER,
                rps_theoretic: Influx.FieldType.INTEGER,
                rps_avg: Influx.FieldType.FLOAT,
                percentile_50: Influx.FieldType.FLOAT,
                percentile_95: Influx.FieldType.FLOAT,
                percentile_99: Influx.FieldType.FLOAT,
                error: Influx.FieldType.INTEGER,
                n: Influx.FieldType.INTEGER
            },
            tags: tags
        },
        {
            measurement: constants.MATRIX+'_benchmark',
            fields: {
                duration: Influx.FieldType.INTEGER,
                latency_avg: Influx.FieldType.FLOAT,
                latency_stdev: Influx.FieldType.FLOAT,
                latency_max: Influx.FieldType.FLOAT,
                total_count: Influx.FieldType.INTEGER,
                rps_theoretic: Influx.FieldType.INTEGER,
                rps_avg: Influx.FieldType.FLOAT,
                percentile_50: Influx.FieldType.FLOAT,
                percentile_95: Influx.FieldType.FLOAT,
                percentile_99: Influx.FieldType.FLOAT,
                error: Influx.FieldType.INTEGER,
                n: Influx.FieldType.INTEGER
            },
            tags: tags
        },
        {
            measurement: constants.CUSTOM+'_benchmark',
            fields: {
                duration: Influx.FieldType.INTEGER,
                latency_avg: Influx.FieldType.FLOAT,
                latency_stdev: Influx.FieldType.FLOAT,
                latency_max: Influx.FieldType.FLOAT,
                total_count: Influx.FieldType.INTEGER,
                rps_theoretic: Influx.FieldType.INTEGER,
                rps_avg: Influx.FieldType.FLOAT,
                percentile_50: Influx.FieldType.FLOAT,
                percentile_95: Influx.FieldType.FLOAT,
                percentile_99: Influx.FieldType.FLOAT,
                error: Influx.FieldType.INTEGER,
                n: Influx.FieldType.INTEGER
            },
            tags: tags
        }
    ]
});

var allUrls = {
    latency: [],
    factors: [],
    matrix: [],
    filesystem: [],
    custom: []
};

function loadUrls() {
    allUrls = {
        latency: [],
        factors: [],
        matrix: [],
        filesystem: [],
        custom: []
    };
    for(let i = 0; i<constants.TESTS.length; i++) {
        var rawdata = fs.readFileSync('./urls/'+constants.TESTS[i]+'_urls.json');
        var urls = JSON.parse(rawdata);
        allUrls[constants.TESTS[i]] = urls;
    }
}

/** Executes a shell command and return it as a Promise. */
function execShellCommand(cmd) {
	return new Promise((resolve, reject) => {
		exec(cmd, (error, stdout, stderr) => {
	  		if (error) {
				let errorMsg = 'TIME: ' + (new Date(Date.now() - ((new Date()).getTimezoneOffset() * 60000))).toISOString() + '\n';
				errorMsg += 'ERROR: ' + error;
				errorMsg += 'STDOUT: ' + stdout + (stdout? '' : '\n');
				errorMsg += 'STDERR: ' + stderr + (stderr? '' : '\n');
				errorMsg += '----------------------------------------------------------------------------------------------------\n';
				reject(errorMsg);
	  		}		
	  		resolve(stdout? stdout : stderr);
	 	});
	});
}

async function loadsplittest(cpuTest, ioTest, testName, cpuRps, ioRps, cpuDuration, ioDuration, n) {

    const wrk2 = 'docker run --rm bschitter/alpine-with-wrk2:0.1';
    loadUrls();
    console.error(allUrls);

    let error = false;

    for(let i = 0; i<Math.min(allUrls[cpuTest].length, allUrls[ioTest].length); i++) {
        allUrls[cpuTest][i].url += '?n=' + n;

        // 1 request until completed
        await Promise.all([request.get(allUrls[cpuTest][i].url), request.get(allUrls[ioTest][i].url)]);

        // run for 10 seconds to avoid cold start latencies
        await Promise.all([execShellCommand(wrk2 + ' -c100 -t2 -d10s -R' + cpuRps + ' -L ' + allUrls[cpuTest][i].url), execShellCommand(wrk2 + ' -c100 -t2 -d10s -R' + ioRps + ' -L ' + allUrls[ioTest][i].url)]);        

        // sleep 10 seconds to avoid that the function is still under load
        await new Promise(resolve => setTimeout(resolve, 10000));

        // benchmark
        let result = await Promise.all([execShellCommand(wrk2 + ' -c100 -t2 -d' + cpuDuration + 's -R' + cpuRps + ' -L ' + allUrls[cpuTest][i].url), execShellCommand(wrk2 + ' -c100 -t2 -d' + ioDuration + 's -R' + ioRps + ' -L ' + allUrls[ioTest][i].url)])
        .catch((err) => {
            console.error(err);
            error = true;
        });

        if(error) {
            break;
        }
	
	let cpuResult = result[0];
	let ioResult = result[1];

	let statsCollector = (result) => {
            let latency_avg = 0;
            let latency_stdev = 0;
            let latency_max = 0;
            let total_count = 0;
            let rps_avg = 0;
            let percentile_50 = 0;
            let percentile_95 = 0;
            let percentile_99 = 0;
            let errors = 0;
            let lines = result.split('\n');
            for(let j=0; j<lines.length; j++) {
                if(lines[j].startsWith('#[Mean')) {
                    let cleanLine = lines[j].replace(/ /g, '');
                    let parts = cleanLine.split(',');
                    latency_avg = parts[0].substring(parts[0].indexOf("=") + 1);
                    latency_stdev = parts[1].substring(parts[1].indexOf("=") + 1).replace(']','');

                } else if(lines[j].startsWith('#[Max')) {
                    let cleanLine = lines[j].replace(/ /g, '');
                    let parts = cleanLine.split(',');
                    latency_max = parts[0].substring(parts[0].indexOf("=") + 1);
                    total_count = parts[1].substring(parts[1].indexOf("=") + 1).replace(']','');

                } else if(lines[j].startsWith('Requests/sec:')) {
                    let cleanLine = lines[j].replace(/ /g, '');
                    rps_avg = cleanLine.substring(cleanLine.indexOf(":") + 1);

                } else if(lines[j].startsWith('  Socket errors:')) {
                    let cleanLine = lines[j].replace(/ /g, '');
                    cleanLine = cleanLine.substring(cleanLine.indexOf(":") + 1);
                    let parts = cleanLine.split(',');
                    for(let k=0; k<parts.length; k++) {
                        errors += Number(parts[k].replace(/([^0-9])/g,''));
                    }

                } else if(lines[j].startsWith(' 50.000%')) {
                    let cleanLine = lines[j].replace(/ /g, '');
                    if(cleanLine.includes('ms')) {
                        cleanLine = cleanLine.replace(/([a-z])/g,'');
                        percentile_50 = cleanLine.substring(cleanLine.indexOf("%") + 1);
                    } else {
                        cleanLine = cleanLine.replace(/([a-z])/g,'');
                        percentile_50 = cleanLine.substring(cleanLine.indexOf("%") + 1) * 1000;
                    }

                } else if(lines[j].startsWith(' 99.000%')) {
                    let cleanLine = lines[j].replace(/ /g, '');
                    if(cleanLine.includes('ms')) {
                        cleanLine = cleanLine.replace(/([a-z])/g,'');
                        percentile_99 = cleanLine.substring(cleanLine.indexOf("%") + 1);
                    } else {
                        cleanLine = cleanLine.replace(/([a-z])/g,'');
                        percentile_99 = cleanLine.substring(cleanLine.indexOf("%") + 1) * 1000;
                    }

                } else if(lines[j].includes('0.950000')) {
                    let cleanLine = lines[j].replace(/  +/g, ' ');
                    let parts = cleanLine.split(' ');
                    percentile_95 = Math.round(parts[1] * 100) / 100;
                }
            }
	    return [latency_avg, latency_stdev, latency_max, total_count, rps_avg, percentile_50, percentile_95, percentile_99, errors].map((val) => {
		    if (isNaN(val)) {
			    return -1;
		    }
		    else {
			    return val;
		    }
	    });
	}

	let cpuStats = statsCollector(cpuResult);
	let ioStats = statsCollector(ioResult);
	console.error(cpuStats);
	console.error(ioStats);
	let [cpuLatency_avg, cpuLatency_stdev, cpuLatency_max, cpuTotal_count, cpuRps_avg, cpuPercentile_50, cpuPercentile_95, cpuPercentile_99, cpuErrors] = cpuStats;
	let [ioLatency_avg, ioLatency_stdev, ioLatency_max, ioTotal_count, ioRps_avg, ioPercentile_50, ioPercentile_95, ioPercentile_99, ioErrors] = ioStats;

        insertIntoDB(cpuTest+'_benchmark', testName, allUrls[cpuTest][i].language, allUrls[cpuTest][i].provider, allUrls[cpuTest][i].memory, cpuDuration, cpuLatency_avg, cpuLatency_stdev, cpuLatency_max, cpuTotal_count, cpuRps, cpuRps_avg, cpuPercentile_50, cpuPercentile_95, cpuPercentile_99, cpuErrors, n);
        insertIntoDB(ioTest+'_benchmark', testName, allUrls[ioTest][i].language, allUrls[ioTest][i].provider, allUrls[ioTest][i].memory, ioDuration, ioLatency_avg, ioLatency_stdev, ioLatency_max, ioTotal_count, ioRps, ioRps_avg, ioPercentile_50, ioPercentile_95, ioPercentile_99, ioErrors, n);

    }

    return !error;
}

async function loadprioritytest(test, testName, rps, duration, workloadSplit, n) {

    const wrk2 = 'docker run --rm bschitter/alpine-with-wrk2:0.1';
    loadUrls();
    console.error(allUrls);

    let error = false;

    for(let i = 0; i<allUrls[test].length; i += 2) {

        if(duration<30) {
            duration = 30;
        }
        if(test == constants.FACTORS || test == constants.MATRIX) {
            allUrls[test][i].url += '?n=' + n;
            allUrls[test][i+1].url += '?n=' + n;
        } else {
            n = 0;
        }

        // 1 request until completed
        await Promise.all([request.get(allUrls[test][i].url), request.get(allUrls[test][i+1].url)]);

        // run for 10 seconds to avoid cold start latencies
        await Promise.all([execShellCommand(wrk2 + ' -c100 -t2 -d10s -R' + rps + ' -L ' + allUrls[test][i].url), execShellCommand(wrk2 + ' -c100 -t2 -d10s -R' + rps + ' -L ' + allUrls[test][i+1].url)]); 

        // sleep 10 seconds to avoid that the function is still under load
        await new Promise(resolve => setTimeout(resolve, 10000));

        // benchmark
        let result = await Promise.all([execShellCommand(wrk2 + ' -c100 -t2 -d' + duration + 's -R' + rps + ' -L ' + allUrls[test][i].url), execShellCommand(wrk2 + ' -c100 -t2 -d' + duration + 's -R' + rps + ' -L ' + allUrls[test][i+1].url)])
        .catch((err) => {
            console.error(err);
            error = true;
        });

        if(error) {
            break;
        }

	let fn1Result = result[0];
	let fn2Result = result[1];

	let statsCollector = (result) => {
            let latency_avg = 0;
            let latency_stdev = 0;
            let latency_max = 0;
            let total_count = 0;
            let rps_avg = 0;
            let percentile_50 = 0;
            let percentile_95 = 0;
            let percentile_99 = 0;
            let errors = 0;
            let lines = result.split('\n');
            for(let j=0; j<lines.length; j++) {
                if(lines[j].startsWith('#[Mean')) {
                    let cleanLine = lines[j].replace(/ /g, '');
                    let parts = cleanLine.split(',');
                    latency_avg = parts[0].substring(parts[0].indexOf("=") + 1);
                    latency_stdev = parts[1].substring(parts[1].indexOf("=") + 1).replace(']','');

                } else if(lines[j].startsWith('#[Max')) {
                    let cleanLine = lines[j].replace(/ /g, '');
                    let parts = cleanLine.split(',');
                    latency_max = parts[0].substring(parts[0].indexOf("=") + 1);
                    total_count = parts[1].substring(parts[1].indexOf("=") + 1).replace(']','');

                } else if(lines[j].startsWith('Requests/sec:')) {
                    let cleanLine = lines[j].replace(/ /g, '');
                    rps_avg = cleanLine.substring(cleanLine.indexOf(":") + 1);

                } else if(lines[j].startsWith('  Socket errors:')) {
                    let cleanLine = lines[j].replace(/ /g, '');
                    cleanLine = cleanLine.substring(cleanLine.indexOf(":") + 1);
                    let parts = cleanLine.split(',');
                    for(let k=0; k<parts.length; k++) {
                        errors += Number(parts[k].replace(/([^0-9])/g,''));
                    }

                } else if(lines[j].startsWith(' 50.000%')) {
                    let cleanLine = lines[j].replace(/ /g, '');
                    if(cleanLine.includes('ms')) {
                        cleanLine = cleanLine.replace(/([a-z])/g,'');
                        percentile_50 = cleanLine.substring(cleanLine.indexOf("%") + 1);
                    } else {
                        cleanLine = cleanLine.replace(/([a-z])/g,'');
                        percentile_50 = cleanLine.substring(cleanLine.indexOf("%") + 1) * 1000;
                    }

                } else if(lines[j].startsWith(' 99.000%')) {
                    let cleanLine = lines[j].replace(/ /g, '');
                    if(cleanLine.includes('ms')) {
                        cleanLine = cleanLine.replace(/([a-z])/g,'');
                        percentile_99 = cleanLine.substring(cleanLine.indexOf("%") + 1);
                    } else {
                        cleanLine = cleanLine.replace(/([a-z])/g,'');
                        percentile_99 = cleanLine.substring(cleanLine.indexOf("%") + 1) * 1000;
                    }

                } else if(lines[j].includes('0.950000')) {
                    let cleanLine = lines[j].replace(/  +/g, ' ');
                    let parts = cleanLine.split(' ');
                    percentile_95 = Math.round(parts[1] * 100) / 100;
                }
            }
	    return [latency_avg, latency_stdev, latency_max, total_count, rps_avg, percentile_50, percentile_95, percentile_99, errors].map((val) => {
		    if (isNaN(val)) {
			    return -1;
		    }
		    else {
			    return val;
		    }
	    });
	}

	let fn1Stats = statsCollector(fn1Result);
	let fn2Stats = statsCollector(fn2Result);
	console.error(fn1Stats);
	console.error(fn2Stats);
	let [fn1Latency_avg, fn1Latency_stdev, fn1Latency_max, fn1Total_count, fn1Rps_avg, fn1Percentile_50, fn1Percentile_95, fn1Percentile_99, fn1Errors] = fn1Stats;
	let [fn2Latency_avg, fn2Latency_stdev, fn2Latency_max, fn2Total_count, fn2Rps_avg, fn2Percentile_50, fn2Percentile_95, fn2Percentile_99, fn2Errors] = fn2Stats;

        insertIntoDB(test+'_benchmark', testName, allUrls[test][i].language, allUrls[test][i].provider, allUrls[test][i].memory, duration, fn1Latency_avg, fn1Latency_stdev, fn1Latency_max, fn1Total_count, rps, fn1Rps_avg, fn1Percentile_50, fn1Percentile_95, fn1Percentile_99, fn1Errors, n);
        insertIntoDB(test+'_benchmark', testName, allUrls[test][i+1].language, allUrls[test][i+1].provider, allUrls[test][i+1].memory, duration, fn2Latency_avg, fn2Latency_stdev, fn2Latency_max, fn2Total_count, rps, fn2Rps_avg, fn2Percentile_50, fn2Percentile_95, fn2Percentile_99, fn2Errors, n);

    }

    return !error;
}

async function loadtest(test, testName, rps, duration, workloadSplit, n) {

    const wrk2 = 'docker run --rm bschitter/alpine-with-wrk2:0.1';
    loadUrls();
    console.error(allUrls);

    let error = false;

    for(let i = 0; i<allUrls[test].length; i++) {

        if(duration<30) {
            duration = 30;
        }
        if(test == constants.FACTORS || test == constants.MATRIX) {
            allUrls[test][i].url += '?n=' + n;
        } else {
            n = 0;
        }

        // 1 request until completed
        await request.get(allUrls[test][i].url);

        // run for 10 seconds to avoid cold start latencies
        await execShellCommand(wrk2 + ' -c100 -t2 -d10s -R' + rps + ' -L ' + allUrls[test][i].url);        

        // sleep 10 seconds to avoid that the function is still under load
        await new Promise(resolve => setTimeout(resolve, 10000));

        // benchmark
        let result = await execShellCommand(wrk2 + ' -c100 -t2 -d' + duration + 's -R' + rps + ' -L ' + allUrls[test][i].url)
        .catch((err) => {
            console.error(err);
            error = true;
        });

        if(error) {
            break;
        }

        let latency_avg = 0;
        let latency_stdev = 0;
        let latency_max = 0;
        let total_count = 0;
        let rps_avg = 0;
        let percentile_50 = 0;
        let percentile_95 = 0;
        let percentile_99 = 0;
        let errors = 0;

        let lines = result.split('\n');
        for(let j=0; j<lines.length; j++) {
            if(lines[j].startsWith('#[Mean')) {
                let cleanLine = lines[j].replace(/ /g, '');
                let parts = cleanLine.split(',');
                latency_avg = parts[0].substring(parts[0].indexOf("=") + 1);
                latency_stdev = parts[1].substring(parts[1].indexOf("=") + 1).replace(']','');

            } else if(lines[j].startsWith('#[Max')) {
                let cleanLine = lines[j].replace(/ /g, '');
                let parts = cleanLine.split(',');
                latency_max = parts[0].substring(parts[0].indexOf("=") + 1);
                total_count = parts[1].substring(parts[1].indexOf("=") + 1).replace(']','');

            } else if(lines[j].startsWith('Requests/sec:')) {
                let cleanLine = lines[j].replace(/ /g, '');
                rps_avg = cleanLine.substring(cleanLine.indexOf(":") + 1);

            } else if(lines[j].startsWith('  Socket errors:')) {
                let cleanLine = lines[j].replace(/ /g, '');
                cleanLine = cleanLine.substring(cleanLine.indexOf(":") + 1);
                let parts = cleanLine.split(',');
                for(let k=0; k<parts.length; k++) {
                    errors += Number(parts[k].replace(/([^0-9])/g,''));
                }

            } else if(lines[j].startsWith(' 50.000%')) {
                let cleanLine = lines[j].replace(/ /g, '');
                if(cleanLine.includes('ms')) {
                    cleanLine = cleanLine.replace(/([a-z])/g,'');
                    percentile_50 = cleanLine.substring(cleanLine.indexOf("%") + 1);
                } else {
                    cleanLine = cleanLine.replace(/([a-z])/g,'');
                    percentile_50 = cleanLine.substring(cleanLine.indexOf("%") + 1) * 1000;
                }

            } else if(lines[j].startsWith(' 99.000%')) {
                let cleanLine = lines[j].replace(/ /g, '');
                if(cleanLine.includes('ms')) {
                    cleanLine = cleanLine.replace(/([a-z])/g,'');
                    percentile_99 = cleanLine.substring(cleanLine.indexOf("%") + 1);
                } else {
                    cleanLine = cleanLine.replace(/([a-z])/g,'');
                    percentile_99 = cleanLine.substring(cleanLine.indexOf("%") + 1) * 1000;
                }

            } else if(lines[j].includes('0.950000')) {
                let cleanLine = lines[j].replace(/  +/g, ' ');
                let parts = cleanLine.split(' ');
                percentile_95 = Math.round(parts[1] * 100) / 100;
            }
        }

        insertIntoDB(test+'_benchmark', testName, allUrls[test][i].language, allUrls[test][i].provider, allUrls[test][i].memory, duration, latency_avg, latency_stdev, latency_max, total_count, rps, rps_avg, percentile_50, percentile_95, percentile_99, errors, n);

    }

    return !error;
}

function insertIntoDB(test, testName, language, provider, memory, duration, latency_avg, latency_stdev, latency_max, total_count, rps, rps_avg, percentile_50, percentile_95, percentile_99, errors, n) {

    var data = [
        {
          measurement: test,
          tags: {
            test: testName,
            language: language,
            provider: provider,
            memory: memory
          },
          fields: {
            duration: duration,
            latency_avg: latency_avg,
            latency_stdev: latency_stdev,
            latency_max: latency_max,
            total_count: total_count,
            rps_theoretic: rps,
            rps_avg: rps_avg,
            percentile_50: percentile_50,
            percentile_95: percentile_95,
            percentile_99: percentile_99,
            error: errors,
            n: n
          },
        }
    ];

    influx.writePoints(data)
    .catch((err) => {
        console.error(err);
        console.error('Could not write to DB!');
    });
}

module.exports = { loadtest, loadsplittest, loadprioritytest };
