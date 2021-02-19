const vsSource = `
    attribute vec4 aVertexPosition;
    
    void main() {
        gl_Position = aVertexPosition;
    }
`;
    
const fsSource = `
    precision highp float;
    
    #define BACKGROUND_COLOR vec4(0.0, 0.0, 0.0, 1.0)
    #define FOREGROUND_COLOR vec4(1.0, 1.0, 0.0, 1.0)
    #define BLUR_EDGE 50.0

    uniform vec2 size;
    uniform vec2 pos;
    uniform float blur;
    
    bool rect_contains_point(vec2 point, vec2 pos, vec2 size)
    {
        return pos.x <= point.x && point.x < pos.x + size.x 
            && pos.y <= point.y && point.y < pos.y + size.y;
    }
    
    void main() {
        vec2 point = gl_FragCoord.xy;
        
        if (rect_contains_point(point, pos, size)) {
            gl_FragColor = FOREGROUND_COLOR;
        } else {
            float edge = blur * BLUR_EDGE;
            
            if (pos.x <= point.x && point.x < pos.x + size.x) {
                edge = min(abs(point.y - pos.y),
                           abs(point.y - (pos.y + size.y)));
            } else if (pos.y <= point.y && point.y < pos.y + size.y) {
                edge = min(abs(point.x - pos.x),
                           abs(point.x - (pos.x + size.x)));
            } else {
                edge = min(edge, length(point - (pos + size * vec2(0.0, 0.0))));
                edge = min(edge, length(point - (pos + size * vec2(1.0, 0.0))));
                edge = min(edge, length(point - (pos + size * vec2(0.0, 1.0))));
                edge = min(edge, length(point - (pos + size * vec2(1.0, 1.0))));
            }
            
            if (edge < blur * BLUR_EDGE) {
                gl_FragColor = mix(
                    FOREGROUND_COLOR, 
                    BACKGROUND_COLOR,
                    smoothstep(0.0, blur * BLUR_EDGE, edge));
            } else {
                gl_FragColor = BACKGROUND_COLOR;
            }
        }
    }
`;

function makeArrayBuffer(gl, usage, positions) {
    const result = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, result);
    gl.bufferData(gl.ARRAY_BUFFER, positions, usage);
    return result;
}

function shaderTypeAsString(gl, type) {
    if (type === gl.FRAGMENT_SHADER) return "FRAGMENT_SHADER";
    if (type === gl.VERTEX_SHADER) return "VERTEX_SHADER";
    return "UNKNOWN";
}

function compileShader(gl, source, type) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error(`Could not compile shader ${shaderTypeAsString(gl, type)}: ` + gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
    }
    
    return shader;
}

function drawScene(gl, program, buffer) {
    gl.clearColor(1.0, 0.0, 0.0, 1.0);
    gl.clearDepth(1.0);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    {
        const vertexPosition = gl.getAttribLocation(program, 'aVertexPosition');
        const numComponents = 2; // pull out 2 values per iteration
        const type = gl.FLOAT;   // the data in the buffer is 32bit floats
        const normalize = false; // don't normalize
        const stride = 0;        // how many bytes to get from one set of values to the next
                                // 0 = use type and numComponents above
        const offset = 0;        // how many bytes inside the buffer to start from
        gl.vertexAttribPointer(
            vertexPosition,
            numComponents,
            type,
            normalize,
            stride,
            offset);
        gl.enableVertexAttribArray(vertexPosition);
    }
    
    gl.useProgram(program);
    
    {
        const offset = 0;
        const vertexCount = 4;
        gl.drawArrays(gl.TRIANGLE_STRIP, offset, vertexCount);
    }
}

function linkProgram(gl, vsShader, fsShader)
{
    const program = gl.createProgram();
    gl.attachShader(program, vsShader);
    gl.attachShader(program, fsShader);
    gl.linkProgram(program);
    
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.error("Linking program has failed: " + gl.getProgramInfoLog(program));
        return null;
    }
    
    return program;
}

function constructProgram(gl, program, uniforms)
{
    const result = {
        program: program,
        uniforms: {}
    };
    
    uniforms.forEach(name => {
        result.uniforms[name] = gl.getUniformLocation(program, name)
    });
    
    return result;
}

(() => {
    const canvas = document.querySelector("#glCanvas");
    const gl = canvas.getContext("webgl");
    
    if (gl === null) {
        console.error("Your old ass browser does not support WebGL");
        return;
    }
    
    const vs = compileShader(gl, vsSource, gl.VERTEX_SHADER);
    const fs = compileShader(gl, fsSource, gl.FRAGMENT_SHADER);
    const program = linkProgram(gl, vs, fs);
    
    const mainProgram = constructProgram(gl, program, ['size', 'pos', 'blur']);
    gl.useProgram(mainProgram.program);
    
    
    const buffer = makeArrayBuffer(gl, gl.STATIC_DRAW, new Float32Array([
         -1.0,  1.0,
          1.0,  1.0,
         -1.0, -1.0,
          1.0, -1.0
    ]))
    
    console.log(mainProgram);
    
    let x = 10.0;
    let y = 10.0;
    let dx = -300.0;
    let dy = -300.0;
    const width = 100.0;
    const height = 100.0;
    let blur = 0.0
    
    gl.uniform2f(mainProgram.uniforms['size'], width, height);
    
    let start;
    function step(timestamp) {
        if (start === undefined) {
            start = timestamp;
        }
        const dt = (timestamp - start) * 0.001;
        start = timestamp;
        
        blur = Math.max(0.0, blur - dt * 8.0);
        x += dx * dt;
        y += dy * dt;
        
        if (x < 0.0 || x + width > 800.0) {
            dx = -dx;
            blur = 1.0;
        }
        
        if (y < 0.0 || y + height > 600.0) {
            dy = -dy;
            blur = 1.0;
        }
        
        gl.uniform2f(mainProgram.uniforms['pos'], x, y);
        gl.uniform1f(mainProgram.uniforms['blur'], blur);
        drawScene(gl, program, buffer);
        
        window.requestAnimationFrame(step);
    }
    window.requestAnimationFrame(step);
})();