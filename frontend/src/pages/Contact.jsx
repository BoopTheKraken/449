import { useState } from 'react';

export default function Contact() {
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        message: '',

    });

    const handleChange = (event) => {
        const { name, value } = event.target;
        setFormData(prev => ({
            ...prev,
            [name]: value
        }));
    };

    const handleSubmit = (event) => {
        event.preventDefault();
        // will need to connect to backend here
        alert('Message sent')
        setFormData({ name: '', email: '', message: ''});
    };

    return (
        <div className="max-w-2xl mx-auto">
            <div className="bg-beige rounded-2xl p-6 mb-8">
                <h1 className="text-2xl font-bold text-gray-800 mb-2">Contact Us</h1>
                <p className="text-gray-600">
                    Have questions or feedback? Send us a message.
                </p>
            </div>

            <div className="bg-white rounded-xl p-6 border border-gray-200">
                <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Name Field */}
                    <div>
                        <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                            Name
                        </label>
                        <input
                            type="text"
                            id="name"
                            name="name"
                            value={formData.name}
                            onChange={handleChange}
                            required
                            className="w-full rounded-lg border border-gray-300 
                            px-4 py-2 text-gray-700 
                            focus:border-primary-blue focus:outline-none"
                            placeholder="Your name"
                        />
                    </div>

                    <div>
                        <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                            Email
                        </label>
                        <input
                            type="email"
                            id="email"
                            name="email"
                            value={formData.email}
                            onChange={handleChange}
                            required
                            className="w-full rounded-lg border border-gray-300 
                            px-4 py-2 text-gray-700 
                            focus:border-primary-blue focus:outline-none"
                            placeholder="your@email.com"
                        />
                    </div>

                    <div>
                        <label htmlFor="message" className="block text-sm font-medium text-gray-700 mb-1">
                            Message
                        </label>
                        <textarea
                            id="message"
                            name="message"
                            value={formData.message}
                            onChange={handleChange}
                            required
                            rows={4}
                            className="w-full rounded-lg 
                            border border-gray-300 px-4 py-2 
                            text-gray-700 focus:border-primary-blue 
                            focus:outline-none"
                            placeholder="How can we help?"
                        />
                    </div>

                    <button
                        type="submit"
                        className="btn btn-primary w-full"
                    >
                        Send Message
                    </button>
                </form>
            </div>
        </div>
    );    
}
