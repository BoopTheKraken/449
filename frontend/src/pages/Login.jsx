import { useState } from "react";
import { supabase } from "../config/supabaseClient"
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Whiteboard from "./Whiteboard";
import "./Login.css";

function Login() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [user, setUser] = useState(null);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    const handleSignUp = async () => {
        setError("");
        setLoading(true);
        const {data, error} = await supabase.auth.signUp({email, password});
        setLoading(false);

        if (error) return setError(error.message);

        setUser(data.user ?? null);
    }

    const handleLogin = async () => {
        setError("");
        setLoading(true);
        const {data, error} = await supabase.auth.signInWithPassword({email, password});
        setLoading(false);

        if (error) return setError(error.message);

        setUser(data.user ?? null);
    }
    
    return (
        <div className="container">

            {!user?(
            <div className="card">
                <h2>React Supabase Login</h2>
                {error && <p className="error">{error}</p>}
                {loading?"Please wait...":""}
                <input
                    type="email"
                    placeholder="Email"
                    value={email}
                    onChange={e=>setEmail(e.target.value)}
                />
                <input
                    type="password"
                    placeholder="Password"
                    value={password}
                    onChange={e=>setPassword(e.target.value)}
                />
                <div className="button-group">
                    <button className="login"
                        onClick={handleLogin}
                        disabled={loading || !email || !password}
                    >
                        Login
                    </button>
                    <button className="signup"
                        onClick={handleSignUp}
                        disabled={loading}
                    >
                        Sign Up
                    </button>
                </div>        
            </div>
            ):(
                <BrowserRouter>
                        <Route path="/" elemen={<Whiteboard />} />
                </BrowserRouter>
            )}
        </div>
    );
}

export default Login;