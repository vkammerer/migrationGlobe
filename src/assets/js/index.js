(function() {
	'use strict';
	if (!Detector.webgl) Detector.addGetWebGLMessage();

	var container, stats, camera, controls, scene, renderer, earth, width, height;

	var globeUniforms, fluxUniforms;

	var GuiControls = function() {
		this.speed = 0.004;
		this.fluxColor = '#121314';
		this.clickColor = '#464ea2';
		this.countryColor = '#242ec5';
		this.borderColor = '#2237ff';
	};

	var guiControls = new GuiControls();

	init();
	animate();

	function init() {
		// setup of camera, controls, stats, renderer and scene
		container = document.getElementById('container');
		width = window.innerWidth;
		height = window.innerHeight;

		scene = new THREE.Scene();
		scene.fog = new THREE.Fog(0x111111, 1800, 2000);

		camera = new THREE.PerspectiveCamera(45, width/height, 1, 2000);
		camera.position.z = 1500;
		camera.lookAt(scene.position);

		controls = new THREE.OrbitControls(camera);
		controls.minDistance = 500;
		controls.maxDistance = 2000;
		controls.addEventListener('change', render);

		stats = new Stats();
		document.body.appendChild(stats.domElement);

		// dat.gui
		var gui = new dat.GUI();
		gui.add(guiControls, 'speed', 0.001, 0.03);
		gui.addColor(guiControls, 'fluxColor');
		gui.addColor(guiControls, 'clickColor');
		gui.addColor(guiControls, 'countryColor');
		gui.addColor(guiControls, 'borderColor');

		renderer = new THREE.WebGLRenderer({
			antialias: true
		});
		renderer.setSize(width, height);
		renderer.domElement.style.position = 'absolute';
		container.appendChild(renderer.domElement);

		window.addEventListener('resize', onWindowResize, false);
		document.addEventListener('mousedown', onDocumentMouseDown, false);

		// create a globe representing the earth
		var worldMap = THREE.ImageUtils.loadTexture('assets/img/world_4k_bw.png');
		var bordersMap = THREE.ImageUtils.loadTexture('assets/img/borders_map.png');
		var continentsMap = THREE.ImageUtils.loadTexture('assets/img/continents_map.png');
		var indexMap = THREE.ImageUtils.loadTexture('assets/img/indexed_map.png');

		indexMap.magFilter = THREE.NearestFilter;
		indexMap.minFilter = THREE.NearestFilter;

		globeUniforms = {
			worldMap: {type: 't', value: worldMap},
			bordersMap: {type: 't', value: bordersMap},
			continentsMap: {type: 't', value: continentsMap},
			indexMap: {type: 't', value: indexMap},
			clicked: {type: 'f', value: 0.0},
			clickColor: {type: 'c', value: new THREE.Color(0xff0000)},
			countryColor: {type: 'c', value: new THREE.Color(0xff0000)},
			borderColor: {type: 'c', value: new THREE.Color(0xff0000)},
		};
		var globeMaterial = new THREE.ShaderMaterial({
			uniforms: globeUniforms,
			vertexShader: Shaders.noopVertex,
			fragmentShader: Shaders.globeFragment
		});
		earth = new Globe({
			radius: 400,
			material: globeMaterial
		});
		scene.add(earth);

		var axisHelper = new THREE.AxisHelper(earth.geometry.radius*2);
		scene.add(axisHelper);

		var numberOfPoints = 50;
		var flux = new Flux(earth, numberOfPoints);

		// some basic materials
		//var material = new THREE.LineBasicMaterial({color: 'red', linewidth: 1});
		//var material = new THREE.LineDashedMaterial({color: 0xffaa00, dashSize: 3, gapSize: 1, linewidth: 2});

		// texture passed to the shader
		var shaderTexture = THREE.ImageUtils.loadTexture('assets/img/texture.16.png');
		shaderTexture.wrapS = THREE.RepeatWrapping;
		shaderTexture.wrapT = THREE.RepeatWrapping;

		// manipulated uniforms in the shaders
		fluxUniforms = {
			color: {type: 'c', value: new THREE.Color(0xff0000)},
			texture: {type: 't', value: shaderTexture},
			displacement: {type: 'f', value: 0.0}
		};

		// shader material
		var material = new THREE.ShaderMaterial({
			uniforms: fluxUniforms,
			vertexShader: Shaders.noopVertex,
			fragmentShader: Shaders.fluxFragment,
			blending: THREE.AdditiveBlending,
			depthTest: true,
			depthWrite: false,
			transparent: true,
			linewidth: 1
		});

		// start constructing the lines
		var home = {latitude:47.21176, longitude:-1.57300};
		var xhr = new XMLHttpRequest();
		xhr.open('GET', 'assets/data/capitals.json', true);
		xhr.onreadystatechange = function() {
			if (xhr.readyState === 4 && xhr.status === 200) {
				var data = JSON.parse(xhr.responseText);
				var current;
				for (var i = 0; i < data.length; i++) {
					current = data[i];
					//fluxUniforms.displacement.value = i/data.length;
					var doubleCubicFlux = flux.doubleCubicFlux(home.latitude, home.longitude, current.latitude, current.longitude);
					var currentFlux = new THREE.Line(doubleCubicFlux, material);//, THREE.LinePieces);
					scene.add(currentFlux);
				}
			}
		};
		xhr.send(null);
	}

	function onWindowResize() {
		camera.aspect = window.innerWidth/window.innerHeight;
		camera.updateProjectionMatrix();
		renderer.setSize(window.innerWidth, window.innerHeight);
		render();
	}

	function onDocumentMouseDown(event) {
		var gl = renderer.context;
		// mouse coords converted in -1/+1 where center is the center of the window
		var mouseX = (event.clientX / gl.canvas.clientWidth) * 2 - 1;
		var mouseY = -(event.clientY / gl.canvas.clientHeight) * 2 + 1;
		var vector = new THREE.Vector3(mouseX, mouseY, camera.near);
		// convert the [-1, 1] screen coordinate into a world coordinate on the near plane
		var projector = new THREE.Projector();
		projector.unprojectVector(vector, camera);
		// ray cast from camera to vector deduced by the click
		var raycaster = new THREE.Raycaster(camera.position, vector.sub(camera.position).normalize());
		// see if the ray from the camera into the world hits the globe
		var intersects = raycaster.intersectObject(earth, true);
		// if there is one (or more) intersections
		if (intersects.length > 0) {
			var position = intersects[0].point;
			GeoUtils.getIndex(position, earth, function(index) {
				globeUniforms.clicked.value = index/255;
				GeoUtils.getCountryCodeFromIndex(index, function(country) {
					console.log(country);
				});
			});
		}
	}

	function animate() {
		requestAnimationFrame(animate);
		render();
		stats.update();
		controls.update();
	}

	function render() {
		// play with the parameter that moves the texture
		fluxUniforms.displacement.value += guiControls.speed;
		// play with color
		fluxUniforms.color.value = new THREE.Color(guiControls.fluxColor);
		globeUniforms.clickColor.value = new THREE.Color(guiControls.clickColor);
		globeUniforms.countryColor.value = new THREE.Color(guiControls.countryColor);
		globeUniforms.borderColor.value = new THREE.Color(guiControls.borderColor);
		// tell the renderer to do its job: RENDERING!
		renderer.render(scene, camera);
	}

})();
