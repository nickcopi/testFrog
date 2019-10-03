const request = require('request-promise');
const fs = require('fs');
const {execSync,exec} = require('child_process');
const greenGuy = process.env.greenGuy || 'http://10.167.10.70';
const mkdirp = require('mkdirp');
const os = require('os');
const hostname = os.hostname();

let installing = null;
let figuringOutInstall = false;
let installTimer = 0;
/*timeout in minutes*/
const TIMEOUT_TIME = 60;

let buildTime = async ()=>{
	if(figuringOutInstall){
		await incrementTimer();
		return console.log('Figuring out install ' + (installing?`of ${installing}`:'...'));
	}
	figuringOutInstall = true;
	let queue;
	try{
		queue = JSON.parse(await request(greenGuy + '/getTestQueue').catch(e=>console.log(e)));
	} catch(e){
		//console.error(e.body);
		console.error('Cannot reach queue server, aborting this attempt.');
		return figuringOutInstall = false;
	}
	console.log(queue);
	let target;
	if(installing) {
		await incrementTimer();
		return console.log(`Ignoring queue, must finish installing ${installing}.`);
	}
	for(const q of queue){
		if(target) continue;
		if(q.dibs) continue;
		let dibsStatus;
		try{
			dibsStatus = JSON.parse(await callDibs(q.name));
		} catch(e){
			//console.error(e.body);
			console.error('Cannot reach dibs server, aborting this attempt.');
			return figuringOutInstall = false;
		}
		if(!dibsStatus.success) continue;
		target = q;
	}
	if(!target) return figuringOutInstall = false;
	console.log(target);
	installing = target.name;
	console.log(`Trying to install ${target.name}.`);
	exec(`.\\packless.exe --failonstderr -t ${TIMEOUT_TIME*60} --org lcc --force --name ${target.name} --noprogress --sheet "https://docs.google.com/spreadsheets/d/e/2PACX-1vSzzYOTfYOBVhcXEdsPqnVTxyfyskpJLY8W-EEV5qcMBPJ1TLs8yHi28z7ChXlNnYxv62_YB9NE9bkG/pub?gid=827468310&single=true&output=csv"`,
		async (stderr,stdout)=>{
			if(stderr){
				await sendReport(target.name,false,stderr.toString(),stdout.toString());
				buildTime();
				return;
			}
			if(typeof(stdout === 'object')) stdout = JSON.stringify(stdout);
			let success = didInstall(stdout);
			await sendReport(target.name,success,null,stdout);
			console.log('Done');
			buildTime();

		}
	);
//		//const ps = new Shell({
//		//	executionPolicy:'Bypass',
//		//	noProfile:true
//		//});
//		//ps.addCommand(`.\\packless --org lcc --force --name ${target.name}`);
//		console.log(`Trying to install ${target.name}.`);
//		const result = execSync(`.\\packless.exe --org lcc --force --name ${target.name} --noprogress --sheet "https://docs.google.com/spreadsheets/d/e/2PACX-1vSzzYOTfYOBVhcXEdsPqnVTxyfyskpJLY8W-EEV5qcMBPJ1TLs8yHi28z7ChXlNnYxv62_YB9NE9bkG/pub?gid=827468310&single=true&output=csv"`).toString();
//		console.log('result: ' + result);
//		//let packless = spawn(`${__dirname}\\packless.exe`,['--org','lcc','--force','--name',target.name]);
//		//let result;
//		//packless.stdout.on('data',d=>{
//		//	console.log(d.toString());
//		//	result += d.toString();
//		//});
//		//await onExit(packless);
//		//const result = await ps.invoke();
//		//ps.dispose();
//	}catch(e){
//	}
//	console.log('Done');
//	buildTime();

}


let sendReport = async (name,success,error,result)=>{
	console.log(`sendReport called with name ${name}`);
	installing = null;
	figuringOutInstall = false;
	installTimer = 0;
	console.log(result);
	const options = {
		method:'POST',
		url:greenGuy + '/agentReport',
		headers:{
			'Content-Type':'application/json'
		},
		body:JSON.stringify({
			error,
			success,
			name,
			result,
			hostname
		})
	}
	await request(options).catch(e=>console.log(e));
}
let didInstall = result=>{
	let success = false;
	result.split('\n').forEach(l=>{
		if(l.includes('Chocolatey installed ')){
			l.split(' ').forEach(w=>{
				if(w.includes('/')){
					if(w.split('/')[0] === w.split('/')[1]) success = true;
					if(w.split('/')[0] == 0) success = false;
				}
			});
		}
	});
	return success;
}
let callDibs = async name =>{
	console.log('calling dibs on ' + name);
	if(installing) console.log('Stop being dumb, im installing');
	const options = {
		method:'POST',
		url:greenGuy + '/agentDibs',
		headers:{
			'Content-Type':'application/json'
		},
		body:JSON.stringify({
			name,
			hostname
		})
	}
	let res = await request(options).catch(e=>console.log(e));
	return res;


}


let incrementTimer = async ()=>{
	installTimer++;
	if(installTimer >= TIMEOUT_TIME){
		console.log('Timeout exceeded');
		await sendReport(installing,false,null,`Timeout of ${TIMEOUT_TIME}m exceeded.`);
		doReboot();
		process.exit();
	}
}

let doReboot = ()=>{
	execSync('shutdown /t 0 /r /f');
}

let startSchedule = ()=>{
	setInterval(()=>{
		buildTime();
	},1000 * 60);
};
startSchedule();
buildTime();

