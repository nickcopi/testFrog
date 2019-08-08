const request = require('request-promise');
const fs = require('fs');
const Shell = require('node-powershell');
const greenGuy = process.env.greenGuy || 'http://localhost:8080';
const mkdirp = require('mkdirp');
const os = require('os');
const hostname = os.hostname();

let installing = null;
let figuringOutInstall = false;

let buildTime = async ()=>{
	if(figuringOutInstall) return console.log('Figuring out install ' + (installing?`of ${installing}`:'...'));
	figuringOutInstall = true;
	let queue = JSON.parse(await request(greenGuy + '/getTestQueue').catch(e=>console.log(e)));
	console.log(queue);
	let target;
	if(installing) return console.log(`Ignoring queue, must finish installing ${installing}.`);
	for(const q of queue){
		if(target) continue;
		if(q.dibs) continue;
		const dibsStatus = JSON.parse(await callDibs(q.name));
		if(!dibsStatus.success) continue;
		target = q;
	}
	if(!target) return figuringOutInstall = false;
	console.log(target);
	installing = target.name;
	try{
		const ps = new Shell({
			executionPolicy:'Bypass',
			noProfile:true
		});
		ps.addCommand(`.\\packless --org lcc --force --name ${target.name}`);
		console.log(`Trying to install ${target.name}.`);
		const result = await ps.invoke().catch(e=>{
			console.error(e);
			sendReport(target.name,false,e,e);
		});
		ps.dispose();
		let success = didInstall(result);
		sendReport(target.name,success,null,result);
	}catch(e){
		console.error(e);
		sendReport(target.name,false,e,e);
	}
	console.log('Done');
	buildTime();

}
let sendReport = (name,success,error,result)=>{
	installing = null;
	figuringOutInstall = false;
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
	request(options).catch(e=>console.log(e));
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
let startSchedule = ()=>{
	setInterval(()=>{
		buildTime();
	},1000 * 60);
};
buildTime();
startSchedule();

